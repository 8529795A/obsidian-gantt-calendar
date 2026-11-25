/**
 * Daily Note 目标日期 — 回归测试
 *
 * 缺陷背景（2026-11-21 用户报告）：
 *   今天 21 号，在日历里给 18 号添加任务，任务却被写进了 21 号（今天）的 Daily Note。
 *
 * 根因：
 *   createTaskInDailyNote() 内部硬编码了 window.moment() / new Date()，只用"当前时间"
 *   定位日记文件，完全忽略用户选中的目标日期。
 *
 * 修复：
 *   引入 resolveDailyNoteDate(taskData)，按 targetDate → createdDate → 今天 的优先级
 *   解析出目标日记日期，并归一化到当天零点。
 */

import { resolveDailyNoteDate } from '../src/utils/dailyNoteHelper';
import type { CreateTaskData } from '../src/utils/dailyNoteHelper';

function makeTaskData(overrides: Partial<CreateTaskData> = {}): CreateTaskData {
	return {
		description: '回归用例任务',
		createdDate: new Date(2026, 10, 21, 13, 45, 0),
		dueDate: new Date(2026, 10, 18, 0, 0, 0),
		...overrides,
	};
}

describe('resolveDailyNoteDate — 任务写入哪一天的日记', () => {
	describe('核心缺陷：给过去某天建任务', () => {
		it('显式 targetDate=18 号时，返回 18 号而不是今天', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: new Date(2026, 10, 18, 0, 0, 0),
			}));
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(10); // 11 月
			expect(result.getDate()).toBe(18);
		});

		it('targetDate 为 18 号带时刻时，仍归一化到 18 号零点', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: new Date(2026, 10, 18, 23, 59, 59),
			}));
			expect(result.getDate()).toBe(18);
			expect(result.getHours()).toBe(0);
			expect(result.getMinutes()).toBe(0);
			expect(result.getSeconds()).toBe(0);
			expect(result.getMilliseconds()).toBe(0);
		});

		it('targetDate 优先于 createdDate', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: new Date(2026, 10, 18),
				createdDate: new Date(2026, 10, 21, 13, 45),
			}));
			expect(result.getDate()).toBe(18);
		});
	});

	describe('回退链', () => {
		it('未传 targetDate 时回退到 createdDate', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: null,
				createdDate: new Date(2026, 10, 18, 9, 0),
			}));
			expect(result.getDate()).toBe(18);
		});

		it('targetDate 与 createdDate 都为 null 时回退到今天', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: null,
				createdDate: null as unknown as Date,
			}));
			const today = new Date();
			expect(result.getDate()).toBe(today.getDate());
			expect(result.getHours()).toBe(0);
		});

		it('非法日期回退到今天而不是抛错', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: new Date('not-a-date'),
			}));
			expect(isNaN(result.getTime())).toBe(false);
			expect(result.getHours()).toBe(0);
		});
	});

	describe('跨月/跨年边界', () => {
		it('上个月的最后一天', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: new Date(2026, 9, 31, 20, 0),
			}));
			expect(result.getMonth()).toBe(9); // 10 月
			expect(result.getDate()).toBe(31);
		});

		it('跨年：去年 12 月 31 号', () => {
			const result = resolveDailyNoteDate(makeTaskData({
				targetDate: new Date(2025, 11, 31, 8, 30),
			}));
			expect(result.getFullYear()).toBe(2025);
			expect(result.getMonth()).toBe(11);
			expect(result.getDate()).toBe(31);
		});
	});
});
