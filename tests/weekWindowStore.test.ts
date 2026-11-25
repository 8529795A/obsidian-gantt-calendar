/**
 * 周视图滚动窗口 —— store 集成契约（2026-11-22）
 *
 * 上一版只测了 getWeekFromStart 纯函数，漏掉了 store 的真实写入顺序，
 * 导致线上仍「点了不动」。本测试直接驱动真实 zustand store，
 * 复现并锁定该 bug：
 *
 *   setWeekWindowStart(next)   // ① 设好窗口起点
 *   setCurrentDate(anchor)     // ② 语义是"跳日期并回到标准周对齐" → 把 ① 清成 null
 *
 * 于是窗口永远停在默认周对齐，用户看到「点不动」。
 * 修复：新增原子 action setWeekWindow(start, anchor)，一次写入两个字段。
 */

import { useCalendarStore } from '../src/ui/store/calendarStore';
import { getWeekFromStart, startOfWeek } from '../src/dateUtils/dateUtilsIndex';

function iso(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${dd}`;
}

/** 当前 store 状态下 7 天窗口的起始日（与 WeekView 的取数逻辑一致） */
function windowStartIso(): string {
	const s = useCalendarStore.getState();
	const start = s.weekWindowStart ?? startOfWeek(s.currentDate, true);
	return iso(start);
}

function reset(currentDate: Date): void {
	useCalendarStore.setState({
		currentDate: new Date(currentDate),
		weekWindowStart: null,
	});
}

/** 复刻 Toolbar.navigate 的 week 分支（修复后的实现） */
function navigateWeekFixed(dir: -1 | 1): void {
	const s = useCalendarStore.getState();
	const base = s.weekWindowStart ?? startOfWeek(s.currentDate, true);
	const next = new Date(base);
	next.setDate(next.getDate() + 2 * dir);
	next.setHours(0, 0, 0, 0);
	const anchor = new Date(next);
	anchor.setDate(anchor.getDate() + 2);
	s.setWeekWindow(next, anchor);
}

describe('setCurrentDate 的语义：跳日期并回到标准周对齐', () => {
	test('setCurrentDate 会清空 weekWindowStart', () => {
		useCalendarStore.setState({ weekWindowStart: new Date(2026, 10, 18) });
		useCalendarStore.getState().setCurrentDate(new Date(2026, 10, 20));
		expect(useCalendarStore.getState().weekWindowStart).toBeNull();
	});
});

describe('BUG 复现：分开调用会被 setCurrentDate 清空', () => {
	test('先 setWeekWindowStart 再 setCurrentDate → 窗口起点丢失（这就是"点不动"）', () => {
		reset(new Date(2026, 10, 18)); // 周三
		const s = useCalendarStore.getState();

		const base = s.weekWindowStart ?? startOfWeek(s.currentDate, true);
		const next = new Date(base);
		next.setDate(next.getDate() + 2);
		const anchor = new Date(next);
		anchor.setDate(anchor.getDate() + 2);

		// 修复前的调用顺序
		s.setWeekWindowStart(next);
		s.setCurrentDate(anchor);

		// 窗口起点被清空 → 又退回 startOfWeek(currentDate)，位移消失
		expect(useCalendarStore.getState().weekWindowStart).toBeNull();
		// 表现为：仍是本周周一 11-16，与点击前一致
		expect(windowStartIso()).toBe('2026-11-16');
	});
});

describe('修复后：setWeekWindow 原子写入', () => {
	beforeEach(() => reset(new Date(2026, 10, 18)));

	test('单次点击让窗口起点前进 2 天', () => {
		expect(windowStartIso()).toBe('2026-11-16');
		navigateWeekFixed(1);
		expect(windowStartIso()).toBe('2026-11-18');
	});

	test('连点 4 次每次都真的移动 2 天，绝不重复', () => {
		const seen = [windowStartIso()];
		for (let i = 0; i < 4; i++) {
			navigateWeekFixed(1);
			seen.push(windowStartIso());
		}
		expect(seen).toEqual([
			'2026-11-16',
			'2026-11-18',
			'2026-11-20',
			'2026-11-22',
			'2026-11-24',
		]);
		expect(new Set(seen).size).toBe(5);
	});

	test('反向 -2 天逐次回退', () => {
		const seen: string[] = [];
		for (let i = 0; i < 3; i++) {
			navigateWeekFixed(-1);
			seen.push(windowStartIso());
		}
		expect(seen).toEqual(['2026-11-14', '2026-11-12', '2026-11-10']);
	});

	test('来回点击可回到原点（无累积漂移）', () => {
		navigateWeekFixed(1);
		navigateWeekFixed(1);
		expect(windowStartIso()).toBe('2026-11-20');
		navigateWeekFixed(-1);
		navigateWeekFixed(-1);
		expect(windowStartIso()).toBe('2026-11-16');
	});

	test('currentDate 落在新窗口内，且与窗口起点保持 2 天偏移', () => {
		navigateWeekFixed(1);
		const s = useCalendarStore.getState();
		expect(s.weekWindowStart).not.toBeNull();
		expect(iso(s.currentDate)).toBe('2026-11-20'); // 窗口起点 11-18 + 2
	});

	test('窗口连续 7 天且跨月正确', () => {
		// 滚到 11/28 起
		for (let i = 0; i < 6; i++) navigateWeekFixed(1);
		const s = useCalendarStore.getState();
		const win = getWeekFromStart(s.weekWindowStart!, true);
		expect(iso(win.startDate)).toBe('2026-11-28');
		expect(win.days.map((d) => d.day)).toEqual([28, 29, 30, 1, 2, 3, 4]);
	});

	test('「今天」清空偏移，回到标准周对齐', () => {
		navigateWeekFixed(1);
		navigateWeekFixed(1);
		expect(useCalendarStore.getState().weekWindowStart).not.toBeNull();

		// goToday 的行为
		const s = useCalendarStore.getState();
		s.setWeekWindowStart(null);
		s.setCurrentDate(new Date(2026, 10, 18));

		expect(useCalendarStore.getState().weekWindowStart).toBeNull();
		expect(windowStartIso()).toBe('2026-11-16');
	});
});
