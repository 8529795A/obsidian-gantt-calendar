/**
 * 周视图滚动窗口契约（2026-11-22）
 *
 * 回归目标：工具栏左右箭头每次应让 7 天窗口整体移动 2 天。
 *
 * 历史 bug：navigate() 里写 `d.setDate(d.getDate() + 2 * dir)` 只推进 currentDate，
 * 而 WeekView 用 getWeekOfDate(currentDate) → startOfWeek() 把日期吸附到周首日，
 * 于是「+2 天」在未跨周边界时显示的还是同一周（表现为"点了没反应"）。
 *
 * 修复：引入 store.weekWindowStart（7 天窗口起点，可为任意一天），
 * navigate 显式推进它；WeekView 有该值时用 getWeekFromStart 铺 7 天。
 */

import {
	getWeekFromStart,
	getWeekOfDate,
	startOfWeek,
} from '../src/dateUtils/dateUtilsIndex';
import type { CalendarWeek } from '../src/types';

/** 取某周 7 天的日期数字，便于断言窗口内容 */
function dayNumbers(week: CalendarWeek): number[] {
	return week.days.map((d) => d.day);
}

/** 取某周 7 天的 ISO 日期串 */
function isoDays(week: CalendarWeek): string[] {
	return week.days.map((d) => {
		const y = d.date.getFullYear();
		const m = String(d.date.getMonth() + 1).padStart(2, '0');
		const dd = String(d.date.getDate()).padStart(2, '0');
		return `${y}-${m}-${dd}`;
	});
}

function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	x.setHours(0, 0, 0, 0);
	return x;
}

describe('getWeekFromStart：不吸附周首日', () => {
	test('起点是周三时，窗口就从周三开始（不像 getWeekOfDate 会退回周一）', () => {
		// 2026-11-18 是周三
		const wed = new Date(2026, 10, 18);
		expect(wed.getDay()).toBe(3);

		const fromStart = getWeekFromStart(wed, true);
		expect(fromStart.startDate.getDay()).toBe(3);
		expect(isoDays(fromStart)[0]).toBe('2026-11-18');

		// 对照：getWeekOfDate 会吸附到周一 11-16
		const aligned = getWeekOfDate(wed, undefined, true);
		expect(isoDays(aligned)[0]).toBe('2026-11-16');
	});

	test('窗口恒为连续 7 天', () => {
		const w = getWeekFromStart(new Date(2026, 10, 18), true);
		expect(w.days).toHaveLength(7);
		const days = isoDays(w);
		for (let i = 1; i < 7; i++) {
			const prev = new Date(days[i - 1]);
			const cur = new Date(days[i]);
			expect(cur.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
		}
	});

	test('endDate = startDate + 6 天', () => {
		const w = getWeekFromStart(new Date(2026, 10, 18), true);
		expect(isoDays(w)[6]).toBe('2026-11-24');
		expect(w.endDate.getDate()).toBe(24);
	});
});

describe('±2 天滚动：每次必须真的移动窗口', () => {
	test('从周对齐态出发，连点 3 次 +2 天得到三个不同窗口', () => {
		// 初始：currentDate = 周三 11/18 → 对齐窗口起点 11/16（周一）
		const currentDate = new Date(2026, 10, 18);
		let windowStart = startOfWeek(currentDate, true);
		expect(isoDays(getWeekFromStart(windowStart, true))[0]).toBe('2026-11-16');

		const seen = [isoDays(getWeekFromStart(windowStart, true))[0]];

		// 模拟点击 3 次「下一个」
		for (let i = 0; i < 3; i++) {
			windowStart = addDays(windowStart, 2);
			seen.push(isoDays(getWeekFromStart(windowStart, true))[0]);
		}

		// 每次起点都前进 2 天，绝不重复
		expect(seen).toEqual(['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-22']);
		expect(new Set(seen).size).toBe(4);
	});

	test('对照：只推进 currentDate 会被 startOfWeek 抹平（原 bug 复现）', () => {
		// 这是修复前的算法：只 setDate(+2)，窗口仍走 getWeekOfDate
		const base = new Date(2026, 10, 18);
		const starts = [0, 1, 2, 3].map((n) => {
			const d = addDays(base, 2 * n);
			return isoDays(getWeekOfDate(d, undefined, true))[0];
		});
		// 前三次全都落在同一周 → 用户看到"没反应"
		expect(starts[0]).toBe('2026-11-16');
		expect(starts[1]).toBe('2026-11-16');
		expect(starts[2]).toBe('2026-11-16');
		// 第 4 次才跨周跳变
		expect(starts[3]).toBe('2026-11-23');
	});

	test('反向 -2 天同样每次移动 2 天', () => {
		let windowStart = new Date(2026, 10, 16);
		const seen: string[] = [];
		for (let i = 0; i < 3; i++) {
			windowStart = addDays(windowStart, -2);
			seen.push(isoDays(getWeekFromStart(windowStart, true))[0]);
		}
		expect(seen).toEqual(['2026-11-14', '2026-11-12', '2026-11-10']);
	});

	test('滚动窗口可跨月且不丢失日期连续性', () => {
		// 从 11/28 起 7 天 → 跨到 12 月
		const w = getWeekFromStart(new Date(2026, 10, 28), true);
		const days = isoDays(w);
		expect(days[0]).toBe('2026-11-28');
		expect(days[3]).toBe('2026-12-01');
		expect(days[6]).toBe('2026-12-04');
		expect(dayNumbers(w)).toEqual([28, 29, 30, 1, 2, 3, 4]);
	});
});

describe('startOnMonday 设置对滚动窗口无影响（起点由调用方决定）', () => {
	test('起点固定时，startOnMonday 不影响窗口起始日', () => {
		const start = new Date(2026, 10, 18); // 周三
		const mon = getWeekFromStart(start, true);
		const sun = getWeekFromStart(start, false);
		expect(isoDays(mon)).toEqual(isoDays(sun));
	});
});
