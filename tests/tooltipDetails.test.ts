/**
 * 悬浮窗任务详情 — 构建契约（2026-11-25）
 *
 * 用户需求：鼠标悬停在块上时，悬浮窗在标题下方显示任务详情。
 * 经确认：
 *  - 详情最多显示 4 行，超出显示「…还有 N 行」
 *  - `==高亮==` 语法只去掉等号，不加背景色
 */

import {
	buildTooltipDetails,
	buildTooltipSections,
	TOOLTIP_DETAIL_MAX_LINES,
} from '../src/components/tooltip/tooltipSections';
import type { GCTask } from '../src/types';

function mkTask(details?: string): GCTask {
	return {
		filePath: 'Daily Note/2026-11-23.md',
		fileName: '2026-11-23',
		lineNumber: 9,
		content: '🎯 三十三-小群-拿1116包资源',
		description: '三十三-小群-拿1116包资源',
		details,
		status: 'important',
		tags: ['LifeAfter'],
		// 真实任务带日期，属性区才会有 time 分组
		createdDate: new Date(2026, 10, 23),
		startDate: new Date(2026, 10, 23, 17, 45),
		dueDate: new Date(2026, 10, 23, 18, 45),
		datePrecision: { createdDate: 'day', startDate: 'time', dueDate: 'time' },
	} as unknown as GCTask;
}

/** 真实笔记里的 8 行详情（2026-11-23.md） */
const REAL_DETAILS = [
	'==拿到了 1116 版本的包以及补丁==',
	'==「qq.zip」，复制整段内容，打开最新版「夸克APP」即可获取。==',
	'==畅享原画，免费5倍速播放，支持AI字幕和投屏，更有网盘TV版。==',
	'==/~31a23cUwAW~:/==',
	'==链接：https://pan.quark.cn/s/30fe1d37d3be==',
	'==畅享原画，免费5倍速播放，支持AI字幕和投屏，更有网盘TV版。==',
	'==/~dfa03cUkAu~:/==',
	'==链接：https://pan.quark.cn/s/2be4c52930b7==',
].join('\n');

describe('buildTooltipDetails', () => {
	test('无详情返回 null', () => {
		expect(buildTooltipDetails(mkTask())).toBeNull();
		expect(buildTooltipDetails(mkTask(''))).toBeNull();
		expect(buildTooltipDetails(mkTask('   \n\n  '))).toBeNull();
	});

	test('去掉 == 高亮等号（不加背景色，只留纯文字）', () => {
		const r = buildTooltipDetails(mkTask('==高亮文字=='));
		expect(r).not.toBeNull();
		expect(r!.lines).toEqual(['高亮文字']);
		expect(r!.lines[0]).not.toContain('==');
	});

	test('真实 8 行详情：只显示前 4 行，其余折叠计数', () => {
		const r = buildTooltipDetails(mkTask(REAL_DETAILS));
		expect(r).not.toBeNull();
		expect(r!.lines).toHaveLength(TOOLTIP_DETAIL_MAX_LINES);
		expect(TOOLTIP_DETAIL_MAX_LINES).toBe(4);
		expect(r!.hiddenCount).toBe(4);
		// 前 4 行内容正确且无 == 残留
		expect(r!.lines[0]).toBe('拿到了 1116 版本的包以及补丁');
		expect(r!.lines[3]).toBe('/~31a23cUwAW~:/');
		for (const l of r!.lines) expect(l).not.toContain('==');
	});

	test('不超过 4 行时全部显示，hiddenCount 为 0', () => {
		const r = buildTooltipDetails(mkTask('第一行\n第二行\n第三行'));
		expect(r!.lines).toEqual(['第一行', '第二行', '第三行']);
		expect(r!.hiddenCount).toBe(0);
	});

	test('恰好 4 行：不折叠', () => {
		const r = buildTooltipDetails(mkTask('1\n2\n3\n4'));
		expect(r!.lines).toHaveLength(4);
		expect(r!.hiddenCount).toBe(0);
	});

	test('恰好 5 行：折叠 1 行', () => {
		const r = buildTooltipDetails(mkTask('1\n2\n3\n4\n5'));
		expect(r!.lines).toHaveLength(4);
		expect(r!.hiddenCount).toBe(1);
	});

	test('保留行首缩进（悬浮窗里层级与笔记一致）', () => {
		const r = buildTooltipDetails(mkTask('\t缩进行一\n  \t缩进行二'));
		expect(r!.lines).toEqual(['\t缩进行一', '  \t缩进行二']);
	});

	test('CRLF 被归一化', () => {
		const r = buildTooltipDetails(mkTask('A\r\nB'));
		expect(r!.lines).toEqual(['A', 'B']);
	});

	test('行内多个高亮片段都被去号', () => {
		const r = buildTooltipDetails(mkTask('==前== 中间 ==后=='));
		expect(r!.lines).toEqual(['前 中间 后']);
	});

	test('孤立 == 也被清除', () => {
		const r = buildTooltipDetails(mkTask('残留 == 符号'));
		expect(r!.lines[0]).toBe('残留  符号');
		expect(r!.lines[0]).not.toContain('==');
	});
});

describe('与悬浮窗属性区共存', () => {
	test('有详情时属性区照常构建（时间/标签/位置）', () => {
		const task = mkTask(REAL_DETAILS);
		const sections = buildTooltipSections(task);
		expect(sections.some((s) => s.key === 'time')).toBe(true);
		expect(sections.some((s) => s.key === 'tags')).toBe(true);
		expect(sections.some((s) => s.key === 'file')).toBe(true);
	});

	test('详情不影响原有分组顺序（时间在最前）', () => {
		const sections = buildTooltipSections(mkTask(REAL_DETAILS));
		expect(sections[0].key).toBe('time');
	});
});
