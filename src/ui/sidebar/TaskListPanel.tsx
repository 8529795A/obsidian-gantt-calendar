import { useEffect, useMemo, useState, type JSX } from 'react';
import type { GCTask, StatusFilterState } from '../../types';
import { DEFAULT_STATUS_FILTER_STATE } from '../../types';
import { SidebarClasses } from '../../utils/bem';
import { buildSidebarConfig } from '../../components/TaskCard';
import { sortTasks } from '../../tasks/taskSorter';
import { DEFAULT_TASK_STATUSES } from '../../tasks/taskStatus';
import { isToday } from '../../dateUtils/dateCompare';
import { isThisWeek } from '../../dateUtils/week';
import { isThisMonth } from '../../dateUtils/dateCompare';
import { i18n } from '../../i18n/i18n';
import { TagTreeFilter } from '../components/TagTreeFilter';
import { usePlugin } from '../pluginContext';
import { useCalendarStore } from '../store/calendarStore';
import { TaskCard } from '../components/TaskCard';
import { DropdownMenu, type DropdownMenuSection } from '../components/DropdownMenu';
import { Icon } from '../components/Icon';

type DateFilter = 'all' | 'today' | 'week' | 'month';
type SortField = 'dueDate' | 'startDate';
type SortOrder = 'asc' | 'desc';

function getSortOptions(): Array<{ key: SortField; label: string }> {
	return [
	{ key: 'dueDate', label: i18n.t('sidebar.taskList.sortOptions.byDueDate') },
	{ key: 'startDate', label: i18n.t('sidebar.taskList.sortOptions.byStartDate') },
	];
}

function getDateOptions(): Array<{ key: DateFilter; label: string; icon: string }> {
	return [
	{ key: 'all', label: i18n.t('sidebar.taskList.dateFilterOptions.all'), icon: 'infinity' },
	{ key: 'today', label: i18n.t('sidebar.taskList.dateFilterOptions.today'), icon: 'sun' },
	{ key: 'week', label: i18n.t('sidebar.taskList.dateFilterOptions.thisWeek'), icon: 'calendar-range' },
	{ key: 'month', label: i18n.t('sidebar.taskList.dateFilterOptions.thisMonth'), icon: 'calendar-days' },
	];
}

function inferStatus(task: GCTask): string {
	// 状态为纯颜色标签，无完成/取消语义：无 status 时统一视为待办
	return task.status || (DEFAULT_TASK_STATUSES[0]?.key ?? 'important');
}

function filterTasks(
	tasks: GCTask[],
	statusFilter: StatusFilterState,
	selectedTags: string[],
	tagOperator: 'OR' | 'AND',
	dateFilter: DateFilter
): GCTask[] {
	let result = tasks;

	if (statusFilter.selectedStatuses.length > 0) {
		result = result.filter(t => statusFilter.selectedStatuses.includes(inferStatus(t)));
	}

	if (selectedTags.length > 0) {
		result = result.filter(t => {
			if (!t.tags || t.tags.length === 0) return false;
			const tagMatches = (selectedTag: string) =>
				t.tags!.some(taskTag =>
					taskTag === selectedTag || taskTag.startsWith(selectedTag + '/')
				);
			if (tagOperator === 'OR') {
				return selectedTags.some(tagMatches);
			}
			return selectedTags.every(tagMatches);
		});
	}

	if (dateFilter !== 'all') {
		const matchFn = dateFilter === 'today' ? isToday
			: dateFilter === 'week' ? (d: Date) => isThisWeek(d)
			: isThisMonth;
		result = result.filter(t => {
			const dates = [t.dueDate, t.scheduledDate, t.startDate, t.createdDate];
			return dates.some(d => d && matchFn(d));
		});
	}

	return result;
}

/**
 * 侧边栏 — 任务列表 Tab（React 版）
 * 搜索、状态/优先级/标签/日期筛选、排序，复用 React TaskCard
 */
export function TaskListPanel(): JSX.Element {
	const plugin = usePlugin();
	const tasks = useCalendarStore((s) => s.tasks);

	const [searchQuery, setSearchQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState<StatusFilterState>({ ...DEFAULT_STATUS_FILTER_STATE });
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [tagOperator, setTagOperator] = useState<'OR' | 'AND' | 'NOT'>('OR');
	const [dateFilter, setDateFilter] = useState<DateFilter>('all');
	const [sortBy, setSortBy] = useState<SortField>('dueDate');
	const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

	// 搜索防抖
	useEffect(() => {
		const t = window.setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 300);
		return () => window.clearTimeout(t);
	}, [searchQuery]);

	// 标签聚合计数
	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const task of tasks) {
			if (task.tags) {
				for (const tag of task.tags) {
					counts.set(tag, (counts.get(tag) || 0) + 1);
				}
			}
		}
		return counts;
	}, [tasks]);



	// 排序任务
	const sortedTasks = useMemo(() => {
		let result = filterTasks(tasks, statusFilter, selectedTags, tagOperator === 'NOT' ? 'AND' : tagOperator, dateFilter);

		if (debouncedQuery) {
			result = result.filter(t =>
				(t.description || '').toLowerCase().includes(debouncedQuery) ||
				(t.filePath || '').toLowerCase().includes(debouncedQuery)
			);
		}

		const field = sortBy === 'dueDate' ? 'dueDate' as const : 'startDate' as const;
		return sortTasks(result, { field, order: sortOrder });
	}, [tasks, statusFilter, selectedTags, tagOperator, dateFilter, debouncedQuery, sortBy, sortOrder]);

	const config = useMemo(() => buildSidebarConfig(plugin.settings), [plugin.settings]);

	const hasStatusFilter = statusFilter.selectedStatuses.length > 0;
	const hasTagFilter = selectedTags.length > 0;
	const hasDateFilter = dateFilter !== 'all';

	// 状态筛选菜单
	const statusSections: DropdownMenuSection[] = useMemo(() => [{
		items: DEFAULT_TASK_STATUSES.map((status) => ({
			key: `status-${status.key}`,
			title: status.name,
			checked: statusFilter.selectedStatuses.includes(status.key),
			keepOpen: true,
			onClick: () => {
				setStatusFilter(prev => {
					const selected = prev.selectedStatuses.includes(status.key)
						? prev.selectedStatuses.filter(s => s !== status.key)
						: [...prev.selectedStatuses, status.key];
					return { selectedStatuses: selected };
				});
			},
		})),
	}], [statusFilter.selectedStatuses]);

	// 排序菜单（点击同项切换升降序）
	const sortSections: DropdownMenuSection[] = useMemo(() => [{
		items: getSortOptions().map((opt) => ({
			key: `sort-${opt.key}`,
			title: opt.label,
			icon: sortBy === opt.key
				? (sortOrder === 'asc' ? 'arrow-up' : 'arrow-down')
				: 'arrow-up-down',
			checked: sortBy === opt.key,
			onClick: () => {
				if (sortBy === opt.key) {
					setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
				} else {
					setSortBy(opt.key);
					setSortOrder('asc');
				}
			},
		})),
	}], [sortBy, sortOrder]);

	// 日期筛选菜单
	const dateSections: DropdownMenuSection[] = useMemo(() => [{
		items: getDateOptions().map((opt) => ({
			key: `date-${opt.key}`,
			title: opt.label,
			icon: opt.icon,
			checked: dateFilter === opt.key,
			onClick: () => setDateFilter(opt.key),
		})),
	}], [dateFilter]);

	// 标签筛选菜单内容（共享 TagTreeFilter 组件）

	return (
		<>
			<div className={SidebarClasses.elements.searchInput}>
				<input
					type="text"
					placeholder={i18n.t('sidebar.taskList.searchPlaceholder')}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
			</div>

			<div className={SidebarClasses.elements.filterBar}>
				<DropdownMenu sections={statusSections} align="left" className="gc-u-pointer" panelStyle={{ width: '160px' }}>
					{({ onClick }) => (
						<button
							className={`clickable-icon${hasStatusFilter ? ' has-active-filter' : ''}`}
							title={i18n.t('sidebar.taskList.filterBar.statusFilter')}
							onClick={onClick}
						>
							<Icon icon="filter" />
						</button>
					)}
				</DropdownMenu>

				<DropdownMenu
						content={() => (
							<TagTreeFilter
								allTags={Array.from(tagCounts.keys())}
								selectedTags={selectedTags}
								onToggle={(fp) => {
									setSelectedTags(prev =>
										prev.includes(fp) ? prev.filter(t => t !== fp) : [...prev, fp]
									);
								}}
								operator={tagOperator}
								onOperatorChange={setTagOperator}
								taskCounts={tagCounts}
							/>
						)}
						align="left" className="gc-u-pointer" panelStyle={{ width: '220px', maxHeight: '320px', overflowY: 'auto' }}>
					{({ onClick }) => (
						<button
							className={`clickable-icon${hasTagFilter ? ' has-active-filter' : ''}`}
							title={i18n.t('sidebar.taskList.filterBar.tagFilter')}
							onClick={onClick}
						>
							<Icon icon="tags" />
						</button>
					)}
				</DropdownMenu>

				<DropdownMenu sections={sortSections} align="left" className="gc-u-pointer" panelStyle={{ width: '180px' }}>
					{({ onClick }) => (
						<button
							className="clickable-icon"
							title={i18n.t('sidebar.taskList.filterBar.sort')}
							onClick={onClick}
						>
							<Icon icon="arrow-up-down" />
						</button>
					)}
				</DropdownMenu>

				<DropdownMenu sections={dateSections} align="left" className="gc-u-pointer">
					{({ onClick }) => (
						<button
							className={`clickable-icon${hasDateFilter ? ' has-active-filter' : ''}`}
							title={i18n.t('sidebar.taskList.filterBar.dateFilter')}
							onClick={onClick}
						>
							<Icon icon="calendar" />
						</button>
					)}
				</DropdownMenu>
			</div>

			<div className={SidebarClasses.elements.taskList}>
				{sortedTasks.length === 0 ? (
					<div className={SidebarClasses.elements.emptyState}>
						{debouncedQuery ? i18n.t('sidebar.taskList.noMatchingTasks') : i18n.t('sidebar.taskList.noTasks')}
					</div>
				) : (
					sortedTasks.map((task) => (
						<TaskCard
							key={`${task.filePath}:${task.lineNumber}`}
							task={task}
							config={config}
						/>
					))
				)}
			</div>
		</>
	);
}