import { useCallback, useMemo, type JSX } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { resolveAnchorDateField } from '../../types';
import { DayViewClasses, withModifiers } from '../../utils/bem';
import { DayViewConfig } from '../../components/TaskCard';
import { usePlugin, useApp } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { TaskCard } from '../components/TaskCard';
import { useDropTarget } from '../utils/useDragAndDrop';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { sortTasks } from '../../tasks/taskSorter';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { buildDayTimelineModel, getTaskInterval } from './week/timelineModel';
import { DayTimelineCanvas } from './week/DayTimelineCanvas';
import { i18n } from '../../i18n/i18n';
import { Logger } from '../../utils/logger';
import type { DateFieldType } from '../../settings/types';

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/**
 * React 日视图
 * 任务区 = 全天区 + 共享单日连续画布（与周视图/侧栏每日时间线同语义）；
 * 保留分屏布局与嵌入式 Daily Note
 */
export function DayView(): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'day'));
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);
	// 稳定回调：TaskCard 已 memo，内联箭头函数会使 memo 失效
	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';

	const timelineConfig = useMemo(() => ({
		...DayViewConfig,
		enableDrag: true,
		enableTooltip: true,
		showTags: plugin.settings.dayViewShowTags ?? true,
		showTicktick: plugin.settings.dayViewShowTicktick ?? true,
		variant: 'timeline' as const,
	}), [plugin.settings]);

	const normalized = useMemo(() => {
		const d = new Date(currentDate);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [currentDate]);

	// ===== 任务数据：视图筛选 + 虚拟周期实例（锚定回退链解析）→ 单日连续画布模型 =====
	const model = useMemo(() => {
		const scoped = applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort);
		const virtualInstances = generateVirtualInstances(
			scoped,
			normalized,
			normalized,
			undefined,
			plugin.settings.recurringTaskDisplayLimit ?? 5
		);
		const combined = sortTasks([...scoped, ...virtualInstances], filter.sort);
		return buildDayTimelineModel(combined, normalized, startField, endField);
	}, [tasks, filter, normalized, startField, endField, plugin.settings.recurringTaskDisplayLimit]);

	// 任务全集（拖放源查找）
	const dragLookupTasks = useMemo(() => tasks, [tasks]);

	// ===== 全天区拖放：转全天（day 精度） =====
	const handleAllDayDrop = useCallback((taskId: string): void => {
		const task = findTaskById(dragLookupTasks, taskId);
		if (!task) return;
		const interval = getTaskInterval(task, startField, endField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};
		if (interval) {
			updates[startField] = normalized;
			updates[endField] = normalized;
			precision = { [startField]: 'day', [endField]: 'day' };
		} else {
			const anchorField = resolveAnchorDateField(task) ?? endField;
			updates[anchorField] = normalized;
			precision = { [anchorField]: 'day' };
		}
		void (async () => {
			try {
				const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precision } };
				await updateTaskProperties(app, taskToUpdate, updates, plugin.settings.enabledTaskFormats || []);
				await plugin.taskCache.refreshFile(task.filePath);
				refreshTasks();
			} catch (error) {
				Logger.error('DayView', 'Set all-day failed:', error);
				new Notice(i18n.t('views.dayView.updateTaskFailed'));
			}
		})();
	}, [dragLookupTasks, normalized, app, plugin, startField, endField, refreshTasks]);

	const allDayDropProps = useDropTarget({
		onDrop: (taskId) => handleAllDayDrop(taskId),
		activeClass: 'gc-day-view__allday--drag-over',
	});

	// ===== 任务区渲染：全天区（始终渲染为拖放目标，与侧栏统一） + 共享连续画布 =====
	// 左右双时间窗：左 00:00–12:00，右 12:00–24:00（各自独立坐标系，见 DayTimelineCanvas.startHour/endHour）
	const renderTaskList = (): JSX.Element => (
		<>
			<div className={DayViewClasses.elements.alldaySection} {...allDayDropProps}>
				<div className={DayViewClasses.elements.alldayLabel}>
					{i18n.t('views.weekView.allDay')}
				</div>
				<div className={DayViewClasses.elements.alldayTasks}>
					{model.allday.map(({ task, timeLabel }) => (
						<div key={`${task.filePath}:${task.lineNumber}`} className={DayViewClasses.elements.alldayItem}>
							<TaskCard
								task={task}
								config={timelineConfig}
								targetDate={normalized}
								onRefresh={handleCardRefresh}
							/>
							{timeLabel ? (
								<span className={DayViewClasses.elements.alldayTime}>{timeLabel}</span>
							) : null}
						</div>
					))}
				</div>
			</div>
			{model.blocks.length === 0 && model.allday.length === 0 ? (
				<div className="gantt-task-empty">{i18n.t('common.noTasks')}</div>
			) : null}
			<div className={DayViewClasses.elements.splitCanvas}>
				<div className={DayViewClasses.elements.canvasPane}>
					<DayTimelineCanvas
						day={normalized}
						model={model}
						config={timelineConfig}
						tasks={dragLookupTasks}
						refresh={handleCardRefresh}
						startHour={0}
						endHour={12}
					/>
				</div>
				<div className={DayViewClasses.elements.canvasDivider} />
				<div className={DayViewClasses.elements.canvasPane}>
					<DayTimelineCanvas
						day={normalized}
						model={model}
						config={timelineConfig}
						tasks={dragLookupTasks}
						refresh={handleCardRefresh}
						startHour={12}
						endHour={24}
					/>
				</div>
			</div>
		</>
	);

	// ===== 仅任务模式（日视图固定为双时间窗，不再嵌入 Daily Note） =====
	// 不渲染「当日任务」标题：把纵向空间全部让给时间刻度
	return (
		<div className="gc-view gc-view--day">
			<div className={withModifiers(DayViewClasses.block, DayViewClasses.modifiers.tasksOnly)}>
				{renderTaskList()}
			</div>
		</div>
	);
}

