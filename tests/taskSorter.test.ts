/**
 * 任务排序 — 单元测试
 *
 * 2026-11-25：优先级功能已整体移除，`priority` 不再是排序字段。
 * 原 SR-01 / SR-01b / SR-02a / SR-04a / SR-05a 等依赖 priority 的用例
 * 已改为按日期/描述字段验证，并新增「priority 已退出排序字段」的契约断言。
 */

import { sortTasks, getSortDisplayText, updateSortState, SORT_OPTIONS } from '../src/tasks/taskSorter';
import type { GCTask, SortState, SortField } from '../src/types';

function makeTask(overrides: Partial<GCTask> & { description: string }): GCTask {
	return {
		filePath: 'test.md',
		fileName: 'test.md',
		lineNumber: 1,
		content: `- [ ] ${overrides.description}`,
		status: 'todo',
		...overrides,
	};
}

describe('任务排序', () => {
	const tasks: GCTask[] = [
		makeTask({
			description: '低优先级任务',
			dueDate: new Date(2024, 0, 20),
			createdDate: new Date(2024, 0, 3),
		}),
		makeTask({
			description: '高优先级任务',
			dueDate: new Date(2024, 0, 10),
			createdDate: new Date(2024, 0, 1),
		}),
		makeTask({
			description: '中优先级任务',
			dueDate: new Date(2024, 0, 15),
			createdDate: new Date(2024, 0, 2),
		}),
	];

	describe('sortTasks', () => {
		it('SR-01: 按描述字母排序', () => {
			const sorted = sortTasks(tasks, { field: 'description', order: 'asc' });
			const descriptions = sorted.map(t => t.description);
			for (let i = 1; i < descriptions.length; i++) {
				expect(descriptions[i - 1].localeCompare(descriptions[i], 'zh-CN')).toBeLessThanOrEqual(0);
			}
		});

		it('SR-02: 按创建日期升序', () => {
			const sorted = sortTasks(tasks, { field: 'createdDate', order: 'asc' });
			expect(sorted[0].description).toBe('高优先级任务'); // 2024-01-01
			expect(sorted[2].description).toBe('低优先级任务'); // 2024-01-03
		});

		it('SR-03: 按到期日降序', () => {
			const sorted = sortTasks(tasks, { field: 'dueDate', order: 'desc' });
			expect(sorted[0].description).toBe('低优先级任务'); // 2024-01-20
		});

		it('SR-04: 升序/降序反转', () => {
			const asc = sortTasks(tasks, { field: 'dueDate', order: 'asc' });
			const desc = sortTasks(tasks, { field: 'dueDate', order: 'desc' });
			expect(asc[0]).toEqual(desc[2]);
			expect(asc[2]).toEqual(desc[0]);
		});

		it('SR-05: 无日期的任务排在后面', () => {
			const noDateTask = makeTask({ description: '无日期任务' });
			const withDate = [...tasks, noDateTask];
			const sorted = sortTasks(withDate, { field: 'dueDate', order: 'asc' });
			expect(sorted[sorted.length - 1].description).toBe('无日期任务');
		});

		it('SR-06: 不修改原数组', () => {
			const original = [...tasks];
			sortTasks(tasks, { field: 'dueDate', order: 'desc' });
			expect(tasks).toEqual(original);
		});

		it('SR-07: 相同主排序值时按描述二级排序', () => {
			const sameDue: GCTask[] = [
				makeTask({ description: 'B任务', dueDate: new Date(2024, 0, 10) }),
				makeTask({ description: 'A任务', dueDate: new Date(2024, 0, 10) }),
			];
			const sorted = sortTasks(sameDue, { field: 'dueDate', order: 'asc' });
			expect(sorted[0].description).toBe('A任务');
			expect(sorted[1].description).toBe('B任务');
		});

		it('SR-08: priority 已不是排序字段（传入时不被识别，原样返回）', () => {
			// 优先级功能移除后，'priority' 不在 comparators 中 → 直接返回原数组
			const sorted = sortTasks(tasks, { field: 'priority' as SortField, order: 'asc' });
			expect(sorted).toBe(tasks);
		});
	});

	describe('getSortDisplayText', () => {
		it('SR-09: 返回排序字段的图标和方向', () => {
			const text = getSortDisplayText({ field: 'dueDate', order: 'asc' });
			expect(text).toContain('📅');
			expect(text).toContain('⬆️');
		});

		it('SR-10: 降序显示下箭头', () => {
			const text = getSortDisplayText({ field: 'dueDate', order: 'desc' });
			expect(text).toContain('⬇️');
		});

		it('SR-11: 未知字段显示默认图标', () => {
			const text = getSortDisplayText({ field: 'unknown' as SortField, order: 'asc' });
			expect(text).toBe('📊');
		});
	});

	describe('updateSortState', () => {
		it('SR-12: 同字段切换方向', () => {
			const current: SortState = { field: 'dueDate', order: 'asc' };
			const updated = updateSortState(current, 'dueDate');
			expect(updated).toEqual({ field: 'dueDate', order: 'desc' });
		});

		it('SR-13: 不同字段切到新字段并升序', () => {
			const current: SortState = { field: 'description', order: 'desc' };
			const updated = updateSortState(current, 'dueDate');
			expect(updated).toEqual({ field: 'dueDate', order: 'asc' });
		});
	});

	describe('SORT_OPTIONS', () => {
		it('SR-14: 包含全部日期/描述排序字段', () => {
			const fields = SORT_OPTIONS.map(o => o.field);
			expect(fields).toContain('description');
			expect(fields).toContain('createdDate');
			expect(fields).toContain('startDate');
			expect(fields).toContain('scheduledDate');
			expect(fields).toContain('dueDate');
		});

		it('SR-15: 不再包含 priority（优先级功能已移除）', () => {
			const fields = SORT_OPTIONS.map(o => o.field);
			expect(fields).not.toContain('priority');
			expect(SORT_OPTIONS).toHaveLength(5);
		});
	});
});
