import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import type { Dispatch, SetStateAction, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../../types';
import { resolveAnchorDateField } from '../../../types';
import type { DateFieldType } from '../../../settings/types';
import type { TaskCardConfig } from '../../../components/TaskCard/TaskCardConfig';
import { WeekViewClasses } from '../../../utils/bem';
import { usePlugin, useApp } from '../../pluginContext';
import { useTaskTooltip } from '../../components/TooltipProvider';
import { TaskCard } from '../../components/TaskCard';
import { taskKey } from '../../utils/taskKey';
import { updateTaskProperties } from '../../../tasks/taskUpdater';
import type { TaskUpdates } from '../../../tasks/taskSerializer';
import { i18n } from '../../../i18n/i18n';
import { Logger } from '../../../utils/logger';
import {
	type WeekTimelineModel,
	type TimeBlock,
	type TimeBlockSegment,
	type DaySegment,
	getTaskInterval,
	clampSingleFieldWrite,
	formatMinutes,
	DAY_PX,
	MINUTES_PER_DAY,
} from './timelineModel';
import { useBlockResize, setBlockDragMeta, clearBlockDragMeta } from './useBlockResize';
import { useCanvasTouchDrag } from './useCanvasTouchDrag';

/** 全天行单行高度（卡片 24px + 间距 4px，与 CSS 令牌对应） */
const ALLDAY_ROW_PX = 28;

/** 折叠态全天行可见的横跨条行数，超出收进 "+N" 折叠行 */
const ALLDAY_COLLAPSED_LANES = 3;

export interface WeekTimelineDayInfo {
	date: Date;
	isToday: boolean;
	weekday: number;
	day: number;
	lunarText?: string | null;
}

export interface WeekTimelineGridProps {
	days: WeekTimelineDayInfo[];
	dayNames: string[];
	weekStart: Date;
	model: WeekTimelineModel;
	/** 本周任务全集（真实 + 虚拟实例），用于拖放源查找 */
	tasks: GCTask[];
	config: TaskCardConfig;
	showLunar: boolean;
	refreshTasks: () => void;
	updateSeq: number;
	/** 可见日窗口（周内索引，默认全 7 天；手机端 3 日滑动窗口） */
	visibleDayIdxs?: number[];
	/** 横向 swipe 翻页回调（手机端；桌面不传） */
	onSwipe?: (dir: -1 | 1) => void;
}

/** 拖放指示线状态 */
interface DropLineState {
	dayIndex: number;
	min: number;
}

/** 整块拖动的落点预览状态（块上边缘吸附位置 + 任务时长） */
interface DropPreviewState {
	dayIndex: number;
	startMin: number;
	endMin: number;
}

/** ghost 快速创建载荷 */
export type QuickCreate =
	| { type: 'point'; dayIndex: number; min: number }
	| { type: 'range'; dayIndex: number; startMin: number; endMin: number };

/**
 * 周视图连续时间画布：
 * 表头行 + 全天行（横跨条）+ 24 小时连续画布（按分钟绝对定位的时间块）。
 * 交互：点击/拖拽空白创建、块边缘拖拽改起止时间、HTML5 拖放整体平移。
 */
export function WeekTimelineGrid({
	days,
	dayNames,
	weekStart,
	model,
	tasks,
	config,
	showLunar,
	refreshTasks,
	updateSeq,
	visibleDayIdxs,
	onSwipe,
}: WeekTimelineGridProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const tooltip = useTaskTooltip();

	// 可见日窗口（默认全周）；窗口内渲染位置 pos 与周索引 dayIdx 解耦
	const visibleIdxs = visibleDayIdxs ?? [0, 1, 2, 3, 4, 5, 6];
	const colCount = visibleIdxs.length;
	const swipeStartRef = useRef<{ x: number; y: number; pointerType: string } | null>(null);

	const handleGridPointerDown = useCallback((e: ReactPointerEvent) => {
		swipeStartRef.current = { x: e.clientX, y: e.clientY, pointerType: e.pointerType };
	}, []);

	const handleGridPointerUp = useCallback((e: ReactPointerEvent) => {
		const start = swipeStartRef.current;
		swipeStartRef.current = null;
		if (!start || !onSwipe) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		// 横向位移显著大于纵向且超阈值才视为翻页（纵向留给滚动/创建手势）
		if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			onSwipe(dx < 0 ? 1 : -1);
		}
	}, [onSwipe]);

	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	const [dropLine, setDropLine] = useState<DropLineState | null>(null);
	/** 整块拖动的落点预览（块上边缘吸附位置 + 任务时长） */
	const [dropPreview, setDropPreview] = useState<DropPreviewState | null>(null);
	/** 拖放悬停高亮的列（块拖动与外部拖入都显示列高亮，指示线仅外部拖入） */
	const [dragOverCol, setDragOverCol] = useState<number | null>(null);
	const [alldayDragDay, setAlldayDragDay] = useState<number | null>(null);
	const gridRef = useRef<HTMLDivElement | null>(null);

	const hasToday = days.some((d) => d.isToday);

	/** 本周第 dayIndex 天的 00:00 */
	const dayDate = useCallback((dayIndex: number): Date => {
		const d = new Date(weekStart);
		d.setDate(d.getDate() + dayIndex);
		d.setHours(0, 0, 0, 0);
		return d;
	}, [weekStart]);

	/** 当日 00:00 + 分钟偏移（min 可为 1440 = 次日 00:00） */
	const atMinutes = useCallback((base: Date, min: number): Date => {
		const d = new Date(base);
		d.setHours(0, 0, 0, 0);
		d.setMinutes(min);
		return d;
	}, []);

	// ===== 统一写回（复用 updateTaskProperties 的行号漂移校验/文件锁/保时序列化链路） =====
	const persistTaskUpdate = useCallback(async (
		task: GCTask,
		updates: TaskUpdates,
		precisionPatch: Partial<Record<DateFieldType, 'day' | 'time'>>,
		errorKey: string,
	): Promise<boolean> => {
		try {
			tooltip.cancel();
			// 浅拷贝：不变异 store 中的共享任务对象
			const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precisionPatch } };
			await updateTaskProperties(app, taskToUpdate, updates, enabledFormats);
			// 立即刷新指定文件缓存（跳过文件事件防抖），再通知视图
			await plugin.taskCache.refreshFile(task.filePath);
			refreshTasks();
			return true;
		} catch (error) {
			Logger.error('WeekTimelineGrid', 'Task update failed:', error);
			new Notice(i18n.t(errorKey));
			return false;
		}
	}, [app, plugin, enabledFormats, refreshTasks, tooltip]);

	// ===== resize 提交：点任务升级为区间任务 =====
	const commitResize = useCallback((
		block: TimeBlock,
		seg: TimeBlockSegment,
		edge: 'top' | 'bottom',
		newStartMin: number,
		newEndMin: number,
		blockEl: HTMLElement,
	): void => {
		const day = dayDate(seg.dayIndex);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (block.isPoint) {
			// 点任务 resize 即升级为区间任务：按 WYSIWYG 提交拖拽预览所见的边界
			// （被拖的边缘写入新时刻，另一边缘保持预览位置并落盘，前向/后向锚定通用）
			if (edge === 'top') {
				updates[startField] = atMinutes(day, newStartMin);
				updates[endField] = block.end;
			} else {
				updates[startField] = block.start;
				updates[endField] = atMinutes(day, newEndMin);
			}
			precision = { [startField]: 'time', [endField]: 'time' };
		} else if (edge === 'top') {
			updates[startField] = atMinutes(day, newStartMin);
			precision = { [startField]: 'time' };
		} else {
			updates[endField] = atMinutes(day, newEndMin);
			precision = { [endField]: 'time' };
		}

		void (async () => {
			// 列表式布局无绝对定位，写回失败无需还原样式（React 重渲染即为真值）
			await persistTaskUpdate(block.task, updates, precision, 'views.dayView.updateTimeFailed');
		})();
	}, [dayDate, atMinutes, startField, endField, persistTaskUpdate]);

	const beginResize = useBlockResize(commitResize);

	// ===== 拖放落点：整体平移块（保留时长与精度） =====
	// minutes === null（列表式布局拖拽）：保留任务原有时刻，只把日期换到目标日
	const commitBlockMove = useCallback((task: GCTask, dayIndex: number, minutes: number | null): void => {
		const day = dayDate(dayIndex);
		const interval = getTaskInterval(task, startField, endField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		// 保留原时刻：以任务自身起点（或锚点）的时分作为落点分钟
		const keepTimeMinutes = interval
			? interval.start.getHours() * 60 + interval.start.getMinutes()
			: (() => {
				const f = resolveAnchorDateField(task);
				const d = f ? task[f] : undefined;
				return d ? d.getHours() * 60 + d.getMinutes() : 0;
			})();
		const targetMin = minutes === null ? keepTimeMinutes : minutes;

		if (interval && interval.kind === 'point') {
			// 拖动点任务 = 双写起止并自动升级为区间任务：
			// 跨天拖动时若只写锚点字段（如仅 📅），残留的旧 🛫 仅日期字段会让任务
			// 变成 ≥24h 跨日区间；上边缘落点为起点，+ 时长为终点，两端均 time 精度
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const anchorMin = Math.max(0, Math.min(targetMin, MINUTES_PER_DAY - durationMin));
			updates[startField] = atMinutes(day, anchorMin);
			updates[endField] = atMinutes(day, anchorMin + durationMin);
			precision = { [startField]: 'time', [endField]: 'time' };
		} else if (interval) {
			// 区间任务：整体平移，day 精度端点保持整天语义。
			// 仅原本就同日的区间才做"当日容纳"钳制——跨夜区间允许继续跨夜
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const dayOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
			const sameDayOrigin = dayOf(interval.start) === dayOf(interval.end);
			const anchorMin = sameDayOrigin && durationMin <= MINUTES_PER_DAY
				? Math.max(0, Math.min(targetMin, MINUTES_PER_DAY - durationMin))
				: targetMin;
			const newStart = atMinutes(day, anchorMin);
			const shiftMs = newStart.getTime() - interval.start.getTime();
			const startIsTime = task.datePrecision?.[startField] === 'time';
			const endIsTime = task.datePrecision?.[endField] === 'time';
			updates[startField] = startIsTime ? newStart : atMinutes(newStart, 0);
			const shiftedEnd = new Date(interval.end.getTime() + shiftMs);
			updates[endField] = endIsTime ? shiftedEnd : atMinutes(shiftedEnd, 0);
			precision = { ...task.datePrecision };
		} else {
			// 全天任务 / 外部视图拖入：落点即时刻（锚定字段转 time 精度，无锚点写 gantt 终点字段）；
			// 对端钳制：落点越过对端点所在日时钳到对端点日（保留落点时刻），避免制造倒置数据
			const anchorField = resolveAnchorDateField(task) ?? endField;
			updates[anchorField] = clampSingleFieldWrite(task, anchorField, atMinutes(day, targetMin), startField, endField);
			precision = { [anchorField]: 'time' };
		}

		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTimeFailed');
	}, [dayDate, atMinutes, startField, endField, persistTaskUpdate]);

	// ===== 全天行拖放：转全天（day 精度） =====
	const commitAlldayMove = useCallback((task: GCTask, dayIndex: number): void => {
		const day = dayDate(dayIndex);
		const interval = getTaskInterval(task, startField, endField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (interval) {
			// 时间块 → 全天：起止都落到目标日（区间任务收敛为单日全天条）
			updates[startField] = day;
			updates[endField] = day;
			precision = { [startField]: 'day', [endField]: 'day' };
		} else {
			// 对端钳制：落点越过对端点所在日时钳到对端点日，避免制造倒置数据
			const anchorField = resolveAnchorDateField(task) ?? endField;
			updates[anchorField] = clampSingleFieldWrite(task, anchorField, day, startField, endField);
			precision = { [anchorField]: 'day' };
		}

		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTaskFailed');
	}, [dayDate, startField, endField, persistTaskUpdate]);

	// 触屏整块拖动（长按 500ms 起拖；提交与落点预览复用现有链路）
	// 列表式布局：不按像素推算时刻，落点只决定日期（resolveMinutesFromPointer=false）
	const beginBlockTouchPress = useCanvasTouchDrag({
		onCommit: commitBlockMove,
		setPreview: setDropPreview,
		columnSelector: '.' + WeekViewClasses.elements.dayCol,
		resolveMinutesFromPointer: false,
	});

	// ===== 空白快速创建：已关闭（列表式布局无时间轴，无法从位置推算时刻） =====
	// 新建任务请用工具栏「+」按钮，时间在弹窗里填写

	// ===== 当前时间指示线：已移除（无时间轴，无对应位置） =====

	// ===== 全天行：lane 布局不设上限，渲染折叠（极端重叠不挤压时间网格） =====
	const totalAlldayLanes = useMemo(() => (
		model.allday.reduce((max, bar) => Math.max(max, bar.lane + 1), 1)
	), [model.allday]);
	const [alldayExpanded, setAlldayExpanded] = useState(false);
	// 切周后回到折叠态
	useEffect(() => { setAlldayExpanded(false); }, [weekStart]);

	/** 折叠态可见的横跨条行数；其余收进"+N"折叠行 */
	const visibleBarLanes = alldayExpanded ? totalAlldayLanes : Math.min(totalAlldayLanes, ALLDAY_COLLAPSED_LANES);
	const hiddenAlldayCount = alldayExpanded ? 0 : model.allday.filter((b) => b.lane >= ALLDAY_COLLAPSED_LANES).length;
	/** 折叠行本身占一行（展开态的"收起"行同理） */
	const alldayChipRow = alldayExpanded ? totalAlldayLanes : visibleBarLanes;
	const alldayRowHeight = (hiddenAlldayCount > 0 || alldayExpanded ? alldayChipRow + 1 : visibleBarLanes) * ALLDAY_ROW_PX;

	// ===== 全天行拖放 =====
	const handleAlldayDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = e.currentTarget.getBoundingClientRect();
		const dayIndex = Math.max(0, Math.min(6, Math.floor(((e.clientX - rect.left) / rect.width) * 7)));
		setAlldayDragDay((prev) => (prev === dayIndex ? prev : dayIndex));
	}, []);

	const handleAlldayDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setAlldayDragDay(null);
	}, []);

	const handleAlldayDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setAlldayDragDay(null);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const dayIndex = Math.max(0, Math.min(6, Math.floor(((e.clientX - rect.left) / rect.width) * 7)));
		commitAlldayMove(task, dayIndex);
	}, [tasks, commitAlldayMove]);

	const handleCardRefresh = useCallback(() => refreshTasks(), [refreshTasks]);

	return (
		<div
			className={WeekViewClasses.elements.tasksGrid}
			ref={gridRef}
			style={{
				'--gc-tl-hour-h': `${DAY_PX / 24}px`,
				// 无左侧时间刻度列：所有列等分（表头/全天行/日列共享同一栅格）
				gridTemplateColumns: `repeat(${colCount}, 1fr)`,
				// 触屏：纵向滚动交给浏览器，横向位移留给 swipe 翻页
				touchAction: onSwipe ? 'pan-y' : undefined,
			} as CSSProperties}
			onPointerDown={onSwipe ? handleGridPointerDown : undefined}
			onPointerUp={onSwipe ? handleGridPointerUp : undefined}
		>
			{/* 表头（仅渲染可见日窗口） */}
			{visibleIdxs.map((dayIdx, pos) => {
				const day = days[dayIdx];
				return (
					<div
						key={`week-h-${dayIdx}`}
						className={`${WeekViewClasses.elements.headerCell}${day.isToday ? ` ${WeekViewClasses.modifiers.today}` : ''}`}
						style={{ gridColumn: `${pos + 1}`, gridRow: '1' }}
					>
						<div className={WeekViewClasses.elements.dayName}>{dayNames[day.weekday]}</div>
						<div className={WeekViewClasses.elements.dayNumber}>{day.day.toString()}</div>
						{day.lunarText && showLunar ? (
							<div className={WeekViewClasses.elements.lunarText}>{day.lunarText}</div>
						) : null}
					</div>
				);
			})}

			{/* 全天行：栅格已无时间刻度列（7 列全是日期），标签改为绝对定位贴在左上角，
			    不再占用栅格列——否则会与第 1 列日期挤位、导致下方任务块整体错位一格 */}
			<div
				className={WeekViewClasses.elements.alldayRow}
				style={{ gridColumn: '1 / -1', gridRow: '2', height: `${alldayRowHeight}px` }}
				onDragOver={handleAlldayDragOver}
				onDragLeave={handleAlldayDragLeave}
				onDrop={handleAlldayDrop}
			>
				{/* 「全天」文字标签已移除（2026-11-22）：它绝对定位贴在左上角会压住第一列，
				    而全天行的语义已由横跨条本身表达 */}
				{visibleIdxs.map((dayIdx, pos) => {
					const day = days[dayIdx];
					return (
						<div
							key={`week-ac-${dayIdx}`}
							className={`${WeekViewClasses.elements.alldayCell}${day.isToday ? ` ${WeekViewClasses.modifiers.alldayCellToday}` : ''}${alldayDragDay === dayIdx ? ` ${WeekViewClasses.modifiers.alldayCellDragOver}` : ''}`}
							style={{ left: `${(pos / colCount) * 100}%`, width: `${100 / colCount}%` }}
						/>
					);
				})}
				{model.allday.map((bar) => {
					if (!alldayExpanded && bar.lane >= ALLDAY_COLLAPSED_LANES) return null;
					// 横跨条钳制到可见窗口（窗口外部分截断，延续箭头仍指示）
					const clampedStart = Math.max(bar.startDayIndex, visibleIdxs[0]);
					const clampedEnd = Math.min(bar.endDayIndex, visibleIdxs[colCount - 1]);
					if (clampedStart > clampedEnd) return null;
					const spanCount = clampedEnd - clampedStart + 1;
					return (
						<div
							key={`week-ab-${taskKey(bar.task)}`}
							className={`${WeekViewClasses.elements.alldayBar}${bar.continuesBefore || clampedStart > bar.startDayIndex ? ` ${WeekViewClasses.modifiers.alldayBarContinuesBefore}` : ''}${bar.continuesAfter || clampedEnd < bar.endDayIndex ? ` ${WeekViewClasses.modifiers.alldayBarContinuesAfter}` : ''}${bar.stackedIndex > 0 ? ` ${WeekViewClasses.modifiers.alldayBarStacked}` : ''}`}
							style={{
								left: `calc(${((clampedStart - visibleIdxs[0]) / colCount) * 100}% + 2px)`,
								width: `calc(${(spanCount / colCount) * 100}% - 4px)`,
								top: `${bar.lane * ALLDAY_ROW_PX + (bar.stackedIndex > 0 ? 3 : 0)}px`,
								zIndex: bar.stackedIndex > 0 ? 3 : 1,
							}}
						>
							<TaskCard
								task={bar.task}
								config={config}
								targetDate={days[bar.startDayIndex]?.date}
								onClick={() => tooltip.hide()}
								onRefresh={handleCardRefresh}
							/>
							{/* 长区间任务的起止时刻标注（如 "22:00 → 03:00"） */}
							{bar.timeLabel ? (
								<span className={WeekViewClasses.elements.alldayBarTime}>{bar.timeLabel}</span>
						) : null}
					</div>
				);
			})}
			{/* 折叠/收起行：极端重叠时全天行不超过 3 行横跨条 + 本行 */}
			{(hiddenAlldayCount > 0 || alldayExpanded) ? (
				<div
					className={WeekViewClasses.elements.alldayMore}
					style={{ top: `${alldayChipRow * ALLDAY_ROW_PX}px` }}
					role="button"
					tabIndex={0}
					onClick={() => setAlldayExpanded((v) => !v)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							setAlldayExpanded((v) => !v);
						}
					}}
				>
					{alldayExpanded
						? i18n.t('views.weekView.alldayCollapse')
						: i18n.t('views.weekView.alldayMore', { count: hiddenAlldayCount })}
				</div>
			) : null}
		</div>

		{/* 时间沟槽已移除：周视图改为「按时间顺序堆叠 + 自适应高度」的列表式布局 */}

			{/* 日列（按时间顺序堆叠的块列表；dayIndex 为周索引，colPos 为渲染列位） */}
			{visibleIdxs.map((dayIdx, pos) => (
				<DayColumn
					key={`week-col-${dayIdx}`}
					dayIndex={dayIdx}
					colPos={pos}
					day={days[dayIdx]}
					daySegs={model.days[dayIdx] || []}
					config={config}
					beginResize={beginResize}
					beginTouchPress={beginBlockTouchPress}
					onBlockMove={commitBlockMove}
					dropLine={dropLine}
					setDropLine={setDropLine}
					dropPreview={dropPreview}
					setDropPreview={setDropPreview}
					dragOverCol={dragOverCol}
					setDragOverCol={setDragOverCol}
					tasks={tasks}
					hideTooltip={() => tooltip.hide()}
					onCardRefresh={handleCardRefresh}
				/>
			))}

			{/* 当前时间指示线 */}
			{hasToday ? (
				<div className={WeekViewClasses.elements.currentTimeLine} style={{ display: 'none' }} />
			) : null}
		</div>
	);
}

// ===== 日列（按时间顺序堆叠的块列表） =====

interface DayColumnProps {
	/** 周内索引（0-6，模型/状态键） */
	dayIndex: number;
	/** 渲染列位（可见窗口内位置，0 起） */
	colPos: number;
	day: WeekTimelineDayInfo;
	daySegs: DaySegment[];
	config: TaskCardConfig;
	beginResize: ReturnType<typeof useBlockResize>;
	beginTouchPress: ReturnType<typeof useCanvasTouchDrag>;
	onBlockMove: (task: GCTask, dayIndex: number, minutes: number | null) => void;
	dropLine: DropLineState | null;
	setDropLine: Dispatch<SetStateAction<DropLineState | null>>;
	dropPreview: DropPreviewState | null;
	setDropPreview: Dispatch<SetStateAction<DropPreviewState | null>>;
	dragOverCol: number | null;
	setDragOverCol: Dispatch<SetStateAction<number | null>>;
	tasks: GCTask[];
	hideTooltip: () => void;
	onCardRefresh: () => void;
}

function DayColumn({
	dayIndex,
	colPos,
	day,
	daySegs,
	config,
	beginResize,
	beginTouchPress,
	onBlockMove,
	dropLine,
	setDropLine,
	dropPreview,
	setDropPreview,
	dragOverCol,
	setDragOverCol,
	tasks,
	hideTooltip,
	onCardRefresh,
}: DayColumnProps): JSX.Element {
	const colRef = useRef<HTMLDivElement | null>(null);

	// 日列内块宽仅约 1/7 屏宽：标签独占首行且最多 2 个，其余折叠为 "+N"，
	// 避免标签行过长把块撑高。全天横跨条可跨多列、宽度充裕，不套用此限制。
	const blockConfig = useMemo<TaskCardConfig>(
		() => ({ ...config, maxTags: 2 }),
		[config],
	);

	// ===== 空白点击创建已关闭（列表式布局无时间轴，无法从位置推算时刻） =====
	// 保留整块拖放（跨天平移，时间不变）

	// ===== HTML5 拖放（整体平移：只改日期，保留原时间） =====
	const handleDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		setDragOverCol((prev) => (prev === dayIndex ? prev : dayIndex));
		setDropPreview(null);
		setDropLine(null);
	}, [dayIndex, setDropLine, setDropPreview, setDragOverCol]);

	const handleDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setDropLine(null);
		setDropPreview(null);
		setDragOverCol((prev) => (prev === dayIndex ? null : prev));
	}, [dayIndex, setDropLine, setDropPreview, setDragOverCol]);

	const handleDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setDropLine(null);
		setDropPreview(null);
		setDragOverCol(null);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) {
			Logger.error('WeekTimelineGrid', 'Drop source task not found:', taskId);
			return;
		}
		// 列表式布局：落点不再推算时刻，保留任务原时间，只改日期
		clearBlockDragMeta();
		onBlockMove(task, dayIndex, null);
	}, [tasks, dayIndex, onBlockMove, setDropLine, setDropPreview, setDragOverCol]);

	return (
		<div
			ref={colRef}
			className={`${WeekViewClasses.elements.dayCol}${day.isToday ? ` ${WeekViewClasses.modifiers.dayColToday}` : ''}${dragOverCol === dayIndex ? ` ${WeekViewClasses.modifiers.dayColDragOver}` : ''}`}
			data-day-idx={dayIndex}
			style={{ gridColumn: `${colPos + 1}`, gridRow: '3' }}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{/* 块按开始时间升序堆叠（daySegs 已排序），高度由内容自适应，不再依赖时间轴定位 */}
			{daySegs.map(({ block, seg }) => {
				const cls = [
					WeekViewClasses.elements.timeBlock,
					WeekViewClasses.modifiers.timeBlockFlow,
					seg.continuesBefore ? WeekViewClasses.modifiers.timeBlockContinuesBefore : '',
					seg.continuesAfter ? WeekViewClasses.modifiers.timeBlockContinuesAfter : '',
				].filter(Boolean).join(' ');
				return (
					<div
						key={`${taskKey(block.task)}-d${dayIndex}`}
						className={cls}
						onDragStart={(e) => {
							// 记录抓取信息：落点按块上边缘计算而非指针（WYSIWYG），
							// 时长用于落点预览与后向点任务锚点（dragover 阶段 getData 不可用）
							const rect = e.currentTarget.getBoundingClientRect();
							setBlockDragMeta({
								offsetPx: e.clientY - rect.top,
								durationMin: Math.round((block.end.getTime() - block.start.getTime()) / 60000),
							});
						}}
						onDragEnd={() => {
							clearBlockDragMeta();
							setDropPreview(null);
						}}
					>
						{/* 时间文字保留（无时间轴后仍需知道块的时刻） */}
						<span className={WeekViewClasses.elements.timeBlockTime}>
							{`${formatMinutes(seg.startMin)} – ${formatMinutes(seg.endMin)}`}
						</span>
						<TaskCard
							task={block.task}
							config={blockConfig}
							targetDate={day.date}
							onClick={hideTooltip}
							onRefresh={onCardRefresh}
							// 触屏长按菜单由画布手势自管（长按未移动 → 合成 contextmenu），
							// 禁用 TaskCard 内置长按，避免拖拽模式与菜单同时触发
							disableLongPressMenu
						/>
					</div>
				);
			})}
			{/* 拖放落点预览：列表式布局下改为“插入位置高亮条” */}
			{dragOverCol === dayIndex ? (
				<div className={WeekViewClasses.elements.dropPreview} style={{ display: 'none' }} />
			) : null}
		</div>
	);
}

// ===== 工具 =====

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}
