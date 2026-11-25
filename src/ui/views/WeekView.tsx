import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { getWeekOfDate, getWeekFromStart } from '../../dateUtils/dateUtilsIndex';
import { WeekViewConfig } from '../../components/TaskCard';
import { WeekViewClasses } from '../../utils/bem';
import { usePlugin } from '../pluginContext';
import { useCalendarStore, selectViewFilter } from '../store/calendarStore';
import { applyStatusFilter, applyTagFilter, applySort } from '../utils/taskFilters';
import { sortTasks } from '../../tasks/taskSorter';
import { generateVirtualInstances } from '../../tasks/virtualTaskGenerator';
import { i18n } from '../../i18n/i18n';
import { buildWeekTimelineModel } from './week/timelineModel';
import { WeekTimelineGrid } from './week/WeekTimelineGrid';
import { useIsPhone } from '../utils/platform';

/**
 * React 周视图（常驻时间线模式）
 * 数据编排：周数据 + 筛选/排序 + 虚拟周期实例 → 连续画布模型，渲染交给 WeekTimelineGrid
 */
export function WeekView(): JSX.Element {
	const plugin = usePlugin();
	const currentDate = useCalendarStore((s) => s.currentDate);
	const weekWindowStart = useCalendarStore((s) => s.weekWindowStart);
	const setWeekWindow = useCalendarStore((s) => s.setWeekWindow);
	const tasks = useCalendarStore((s) => s.tasks);
	const filter = useCalendarStore((s) => selectViewFilter(s, 'week'));
	const updateSeq = useCalendarStore((s) => s.updateSeq);
	const refreshTasks = useCalendarStore((s) => s.refreshTasks);

	const startOnMonday = !!plugin.settings.startOnMonday;
	const ganttStartField = plugin.settings.ganttStartField || 'startDate';
	const ganttEndField = plugin.settings.ganttEndField || 'dueDate';
	const showLunar = !!plugin.settings.showLunar;
	const recurringLimit = plugin.settings.recurringTaskDisplayLimit ?? 5;

	const config = useMemo(() => ({
		...WeekViewConfig,
		enableDrag: true,
		showTags: plugin.settings.weekViewShowTags,
		showTicktick: plugin.settings.weekViewShowTicktick,
	}), [plugin.settings]);
	// 时间块使用紧凑变体，高度由块容器按时长撑开
	const timelineConfig = useMemo(() => ({ ...config, variant: 'timeline' as const }), [config]);

	const weekData = useMemo(() => {
		// 有滚动窗口起点时按它铺 7 天（起点可为任意一天，不吸附周首日）；
		// 否则按 currentDate 所在周对齐——保证首次进入仍是标准周一/周日为起点
		if (weekWindowStart) return getWeekFromStart(weekWindowStart, startOnMonday);
		return getWeekOfDate(currentDate, currentDate.getFullYear(), startOnMonday);
	}, [currentDate, startOnMonday, weekWindowStart]);

	const weekStart = useMemo(() => {
		const d = new Date(weekData.days[0].date);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekData]);

	const weekEnd = useMemo(() => {
		const d = new Date(weekData.days[6].date);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekData]);

	// 全局筛选 + 排序
	const scoped = useMemo(() => (
		applySort(applyTagFilter(applyStatusFilter(tasks, filter.status), filter.tag), filter.sort)
	), [tasks, filter]);

	// 预生成整周的虚拟周期实例（锚定回退链解析）
	const virtualInstances = useMemo(() => (
		generateVirtualInstances(scoped, weekStart, weekEnd, undefined, recurringLimit)
	), [scoped, weekStart, weekEnd, recurringLimit]);

	// 本周任务全集（真实 + 虚拟，已排序）
	const combined = useMemo(() => (
		sortTasks([...scoped, ...virtualInstances], filter.sort)
	), [scoped, virtualInstances, filter.sort]);

	// 连续画布模型：时间块分段 + lane 布局 + 全天横跨条
	const model = useMemo(() => (
		buildWeekTimelineModel(combined, weekStart, ganttStartField, ganttEndField)
	), [combined, weekStart, ganttStartField, ganttEndField]);

	const handleRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	const dayNames = i18n.t('views.weekView.weekdays') as unknown as string[];

	// ===== 手机端 3 日滑动窗口：可见日为周内连续窗口，swipe 翻页，跨周边界滚到相邻周 =====
	const isPhone = useIsPhone();
	const visibleCount = isPhone ? 3 : 7;
	const [windowStart, setWindowStart] = useState(0);

	// 切周后窗口定位到今天（若本周含今天）或周首日
	useEffect(() => {
		const todayIdx = weekData.days.findIndex((d) => d.isToday);
		const anchor = todayIdx >= 0 ? todayIdx - 1 : 0;
		setWindowStart(Math.max(0, Math.min(anchor, 7 - visibleCount)));
	}, [weekData, visibleCount]);

	const visibleDayIdxs = useMemo(
		() => Array.from({ length: visibleCount }, (_, i) => Math.min(windowStart + i, 6)),
		[windowStart, visibleCount],
	);

	/** swipe 翻页：窗口内滑动一日；越界时整体滚动 1 天（滚动窗口语义，不再整周 ±7） */
	const handleSwipe = useCallback((dir: -1 | 1) => {
		const next = windowStart + dir;
		if (next < 0) {
			const d = new Date(weekStart);
			d.setDate(d.getDate() - 1);
			d.setHours(0, 0, 0, 0);
			// 原子写入窗口起点 + currentDate（后者落到窗口第 2 天），
			// 否则 currentDate 滞留原地，下次点箭头基准不连续
			const anchor = new Date(d);
			anchor.setDate(anchor.getDate() + 1);
			setWeekWindow(d, anchor);
			setWindowStart(0);
			return;
		}
		if (next + visibleCount > 7) {
			const d = new Date(weekStart);
			d.setDate(d.getDate() + 1);
			d.setHours(0, 0, 0, 0);
			const anchor = new Date(d);
			anchor.setDate(anchor.getDate() + 1);
			setWeekWindow(d, anchor);
			setWindowStart(7 - visibleCount);
			return;
		}
		setWindowStart(next);
	}, [windowStart, visibleCount, weekStart, setWeekWindow]);

	return (
		<div className="gc-view gc-view--week">
			<div className={WeekViewClasses.elements.grid}>
				<WeekTimelineGrid
					days={weekData.days}
					dayNames={dayNames}
					weekStart={weekStart}
					model={model}
					tasks={combined}
					config={timelineConfig}
					showLunar={showLunar}
					refreshTasks={handleRefresh}
					updateSeq={updateSeq}
					visibleDayIdxs={visibleDayIdxs}
					onSwipe={isPhone ? handleSwipe : undefined}
				/>
			</div>
		</div>
	);
}
