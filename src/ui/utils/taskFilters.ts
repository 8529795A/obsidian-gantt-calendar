import type { GCTask, SortState, TagFilterState, StatusFilterState } from '../../types';
import { sortTasks } from '../../tasks/taskSorter';
import { DEFAULT_TASK_STATUSES } from '../../tasks/taskStatus';

export function inferStatus(task: GCTask): string {
	// 状态为纯颜色标签，无完成/取消语义：无 status 时统一视为待办
	return task.status || (DEFAULT_TASK_STATUSES[0]?.key ?? 'important');
}

export function applyStatusFilter(tasks: GCTask[], state: StatusFilterState): GCTask[] {
	const { selectedStatuses } = state;
	if (selectedStatuses.length === 0) return tasks;
	return tasks.filter((t) => selectedStatuses.includes(t.status || inferStatus(t)));
}

export function applyTagFilter(tasks: GCTask[], state: TagFilterState): GCTask[] {
	const { selectedTags, operator } = state;
	if (!selectedTags.length) return tasks;
	const selectedLower = selectedTags.map((t) => t.toLowerCase());

	return tasks.filter((task) => {
		if (!task.tags || task.tags.length === 0) {
			return operator === 'NOT';
		}
		const taskLower = task.tags.map((t) => t.toLowerCase());
		const matches = (sel: string) => taskLower.some((t) => t === sel || t.startsWith(sel + '/'));
		if (operator === 'AND') return selectedLower.every(matches);
		if (operator === 'OR') return selectedLower.some(matches);
		return !selectedLower.some(matches);
	});
}

export function applySort(tasks: GCTask[], sort: SortState): GCTask[] {
	return sortTasks(tasks, sort);
}