/**
 * 日视图双时间轴：像素↔分钟换算契约（2026-11-23）
 *
 * BUG：左右分栏（左 0-12 / 右 12-24）时，右栏画布的 rect.top 是**它自己**的顶部，
 * 若换算不加回 windowStartMin，鼠标在右栏 13:00 处会被算成 01:00。
 *
 * 影响路径（已全部修复）：
 *   1. 边缘 resize（useBlockResize）—— 用户报告的主症状
 *   2. 触屏整块拖动（useCanvasTouchDrag）
 * 本来正确的路径：整块 HTML5 拖放、空白创建（它们一直有加 windowStartMin）
 *
 * 另外：跨分栏的块会在边界被裁切，那条裁剪线不是真实起止，拖它会写出错误时间，
 * 因此只允许拖真实边缘（realTopEdge / realBottomEdge）。
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { HOUR_PX, minutesToPx, pxToMinutes, snapMinutes } from '../src/ui/views/week/timelineModel';

const SRC = join(__dirname, '..', 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

/** 复刻「窗口内像素 → 绝对分钟」的正确换算 */
function pixelToAbsoluteMinutes(offsetPx: number, windowStartMin: number): number {
	return snapMinutes(pxToMinutes(offsetPx) + windowStartMin, false);
}

describe('窗口内像素 → 绝对分钟换算', () => {
	test('左栏（0-12）：12:00 位于窗口底部 = 720 分钟', () => {
		const windowStartMin = 0;
		const offsetPx = minutesToPx(720); // 12h × 50px
		expect(pixelToAbsoluteMinutes(offsetPx, windowStartMin)).toBe(720);
	});

	test('右栏（12-24）：窗口顶部 = 720，而非 0', () => {
		const windowStartMin = 12 * 60;
		expect(pixelToAbsoluteMinutes(0, windowStartMin)).toBe(720);
	});

	test('右栏：鼠标落在 13:00 处应得 780 分钟（旧 bug 会得到 60）', () => {
		const windowStartMin = 12 * 60;
		const offsetPx = minutesToPx(60); // 窗口内偏移 1 小时
		expect(pixelToAbsoluteMinutes(offsetPx, windowStartMin)).toBe(780);

		// 复现旧 bug：不加窗口偏移
		const buggy = snapMinutes(pxToMinutes(offsetPx), false);
		expect(buggy).toBe(60); // 13:00 被误算成 01:00
	});

	test('右栏：窗口底部 = 1440（24:00）', () => {
		const windowStartMin = 12 * 60;
		const offsetPx = minutesToPx(720); // 12 小时窗口高
		expect(pixelToAbsoluteMinutes(offsetPx, windowStartMin)).toBe(1440);
	});

	test('HOUR_PX 与窗口高度自洽：12 小时窗口 = 600px', () => {
		expect(minutesToPx(12 * 60)).toBe(12 * HOUR_PX);
		expect(minutesToPx(12 * 60)).toBe(600);
	});
});

describe('useBlockResize：resize 换算带窗口偏移', () => {
	const src = read('ui', 'views', 'week', 'useBlockResize.ts');

	test('接受 windowStartMin / windowEndMin 选项', () => {
		expect(src).toMatch(/windowStartMin\?:\s*number/);
		expect(src).toMatch(/windowEndMin\?:\s*number/);
	});

	test('move 里换算加回窗口起点（不再是裸 pxToMinutes）', () => {
		expect(src).toMatch(/pxToMinutes\(ev\.clientY - rect\.top\)\s*\+\s*winStart/);
	});

	test('钳制范围用窗口边界，而非固定 0 / 1440', () => {
		// 上边缘钳到 winStart，下边缘钳到 winEnd
		expect(src).toMatch(/Math\.max\(winStart,/);
		expect(src).toMatch(/Math\.min\(winEnd,/);
		expect(src).not.toMatch(/Math\.max\(0,\s*Math\.min\(minutes/);
		expect(src).not.toMatch(/Math\.min\(24 \* 60,/);
	});

	test('乐观预览的 top 减去窗口起点（块定位是窗口内坐标）', () => {
		expect(src).toMatch(/minutesToPx\(active\.newStartMin - winStart\)/);
	});
});

describe('useCanvasTouchDrag：触屏落点换算带窗口偏移', () => {
	const src = read('ui', 'views', 'week', 'useCanvasTouchDrag.ts');

	test('deps 声明 windowStartMin', () => {
		expect(src).toMatch(/windowStartMin\?:\s*number/);
	});

	test('落点换算加回窗口起点', () => {
		expect(src).toMatch(/pxToMinutes\(ev\.clientY - p\.offsetPx - rect\.top\)\s*\+\s*winStart/);
	});
});

describe('DayTimelineCanvas：分栏画布接线与假边缘禁拖', () => {
	const src = read('ui', 'views', 'week', 'DayTimelineCanvas.tsx');

	test('beginResize 传入窗口边界', () => {
		expect(src).toMatch(/useBlockResize\(commitResize,\s*\{\s*windowStartMin,\s*windowEndMin\s*\}\)/);
	});

	test('触屏拖动传入 windowStartMin', () => {
		expect(src).toMatch(/columnSelector:[^,]+,\s*\n\s*\/\/[^\n]*\n\s*windowStartMin,/);
	});

	test('裁剪出来的假边缘不渲染 resize 手柄', () => {
		expect(src).toMatch(/const realTopEdge = !continuesBefore/);
		expect(src).toMatch(/const realBottomEdge = !continuesAfter/);
		expect(src).toMatch(/\{realTopEdge && resizable \?/);
		expect(src).toMatch(/\{realBottomEdge && resizable \?/);
		// 不得再用原始 continues 标记控制手柄
		expect(src).not.toMatch(/\{!seg\.continuesBefore && resizable \?/);
		expect(src).not.toMatch(/\{!seg\.continuesAfter && resizable \?/);
	});

	test('分栏模式才渲染灰字说明', () => {
		expect(src).toMatch(/isSplitWindow/);
		expect(src).toMatch(/splitCanvasHint/);
		expect(src).toMatch(/windowStartMin > 0 \|\| windowEndMin < MINUTES_PER_DAY/);
	});
});

describe('侧栏不受影响：默认整天窗口', () => {
	test('DayTimelineCanvas 默认 startHour=0 / endHour=24', () => {
		const src = read('ui', 'views', 'week', 'DayTimelineCanvas.tsx');
		expect(src).toMatch(/startHour = 0, endHour = 24/);
	});

	test('侧栏未传 startHour/endHour → 走默认整天窗口，isSplitWindow 为 false', () => {
		const sidebar = read('ui', 'sidebar', 'DailyTimelinePanel.tsx');
		const idx = sidebar.indexOf('<DayTimelineCanvas');
		expect(idx).toBeGreaterThan(-1);
		const block = sidebar.slice(idx, idx + 600);
		expect(block).not.toMatch(/startHour=/);
		expect(block).not.toMatch(/endHour=/);
	});
});
