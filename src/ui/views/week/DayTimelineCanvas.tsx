import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Notice } from 'obsidian';
import type { GCTask } from '../../../types';
import { resolveAnchorDateField } from '../../../types';
import type { DateFieldType } from '../../../settings/types';
import type { TaskCardConfig } from '../../../components/TaskCard/TaskCardConfig';
import { DayCanvasClasses, ContextMenuClasses, setCssProps } from '../../../utils/bem';
import { usePlugin, useApp } from '../../pluginContext';
import { TaskCard } from '../../components/TaskCard';
import { Icon } from '../../components/Icon';
import { updateTaskProperties } from '../../../tasks/taskUpdater';
import type { TaskUpdates } from '../../../tasks/taskSerializer';
import { isVirtualTask } from '../../../tasks/virtualTaskGenerator';
import { openCreateTaskModal } from '../../modals/TaskFormModal';
import { i18n } from '../../../i18n/i18n';
import { Logger } from '../../../utils/logger';
import {
	type TimeBlock,
	type TimeBlockSegment,
	type DayTimelineModel,
	getTaskInterval,
	clampSingleFieldWrite,
	clampForwardPointEnd,
	minutesToPx,
	pxToMinutes,
	snapMinutes,
	formatMinutes,
	HOUR_PX,
	MIN_DURATION_MIN,
	MINUTES_PER_DAY,
} from './timelineModel';
import { useBlockResize, isBlockResizing, setBlockDragMeta, getBlockDragMeta, clearBlockDragMeta } from './useBlockResize';
import { useCanvasTouchDrag } from './useCanvasTouchDrag';
import { LONG_PRESS_MS, attachTouchScrollGuard, type CreateGesture } from './timelineTouchCreate';

/**
 * 创建手势的像素位移阈值（与周视图一致）：超过才视为拖拽选区
 */
const CREATE_DRAG_THRESHOLD_PX = 5;

/** 事件目标是否位于时间块内 */
function isInsideBlock(target: EventTarget | null): boolean {
	return !!(target instanceof Element && target.closest(`.${DayCanvasClasses.elements.block}`));
}

/** 页面上是否存在打开的右键菜单（trigger 截断冒泡，只能直接探测 DOM） */
function isContextMenuOpen(): boolean {
	return !!document.querySelector(`.${ContextMenuClasses.container}`);
}

/** dataTransfer.taskId（filePath:lineNumber）→ 任务查找 */
function findTaskById(tasks: GCTask[], taskId: string): GCTask | null {
	const [filePath, lineNum] = taskId.split(':');
	const lineNumber = parseInt(lineNum, 10);
	return tasks.find((t) => t.filePath === filePath && t.lineNumber === lineNumber) || null;
}

/** 快速创建载荷 */
type QuickCreate =
	| { type: 'point'; min: number }
	| { type: 'range'; startMin: number; endMin: number };

export interface DayTimelineCanvasProps {
	/** 画布呈现的日期（00:00） */
	day: Date;
	/** 单日时间线模型（buildDayTimelineModel 产物） */
	model: DayTimelineModel;
	/** 画布内卡片配置（timeline 变体） */
	config: TaskCardConfig;
	/** 任务全集（拖放源查找） */
	tasks: GCTask[];
	/** 写回成功后的刷新回调 */
	refresh: () => void;
	/**
	 * 只渲染 [startHour, endHour) 这一段小时（默认整天 0-24）。
	 * 用于日视图左右分栏（左 0-12 / 右 12-24）：
	 * 画布高度、刻度、指针换算、拖拽/创建/resize 全部以该窗口为坐标系，
	 * 跨窗口的任务块按窗口裁剪并加延续标记。
	 */
	startHour?: number;
	endHour?: number;
}

/**
 * 单日连续时间画布（共享组件：日视图任务区 + 侧栏每日时间线）。
 * 与周视图同语义：分钟级定位、点击/拖选空白创建、边缘拖拽改起止时间、
 * 块边缘落点的 HTML5 拖放 + 触屏长按拖动、落点预览、当前时间线。
 */
export function DayTimelineCanvas({ day, model, config, tasks, refresh, startHour = 0, endHour = 24 }: DayTimelineCanvasProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();

	// ===== 小时窗口（日视图左右分栏：左 0-12 / 右 12-24） =====
	// 窗口内的像素坐标以窗口起点为 0，所有指针换算/块定位都减去 windowStartMin
	const windowStartMin = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(startHour * 60)));
	const windowEndMin = Math.max(windowStartMin, Math.min(MINUTES_PER_DAY, Math.round(endHour * 60)));
	const windowMinutes = Math.max(1, windowEndMin - windowStartMin);
	const windowPx = (windowMinutes / 60) * HOUR_PX;
	/** 是否为分栏窗口（非整天）：仅此时才提示「跨栏块用编辑面板改时间」 */
	const isSplitWindow = windowStartMin > 0 || windowEndMin < MINUTES_PER_DAY;

	/** 绝对分钟 → 窗口内像素 */
	const winMinutesToPx = useCallback((minutes: number): number => {
		return minutesToPx(minutes - windowStartMin);
	}, [windowStartMin]);

	const startField = plugin.settings.ganttStartField || 'startDate';
	const endField = plugin.settings.ganttEndField || 'dueDate';
	const enabledFormats = plugin.settings.enabledTaskFormats || [];

	const canvasRef = useRef<HTMLDivElement | null>(null);
	const ghostRef = useRef<HTMLDivElement | null>(null);
	const ghostLabelRef = useRef<HTMLSpanElement | null>(null);
	const createRef = useRef<CreateGesture | null>(null);
	/** document 级监听用稳定包装：业务回调重建时仍能正确解绑 */
	const finishCreateRef = useRef<() => void>(() => {});
	const cancelCreateRef = useRef<() => void>(() => {});
	const onDocumentPointerUp = useCallback(() => finishCreateRef.current(), []);
	const onDocumentPointerCancel = useCallback(() => cancelCreateRef.current(), []);

	// ===== 拖放 UI 状态 =====
	const [dropLine, setDropLine] = useState<number | null>(null);
	const [dropPreview, setDropPreview] = useState<{ startMin: number; endMin: number } | null>(null);
	const [dragOver, setDragOver] = useState(false);

	/** 当日 00:00 + 分钟偏移（可超 1440 = 次日 00:00） */
	const atMinutes = useCallback((min: number): Date => {
		const d = new Date(day);
		d.setMinutes(min);
		return d;
	}, [day]);

	// ===== 统一写回 =====
	const persistTaskUpdate = useCallback(async (
		task: GCTask,
		updates: TaskUpdates,
		precisionPatch: Partial<Record<DateFieldType, 'day' | 'time'>>,
		errorKey: string,
	): Promise<boolean> => {
		try {
			const taskToUpdate = { ...task, datePrecision: { ...task.datePrecision, ...precisionPatch } };
			await updateTaskProperties(app, taskToUpdate, updates, enabledFormats);
			await plugin.taskCache.refreshFile(task.filePath);
			refresh();
			return true;
		} catch (error) {
			Logger.error('DayTimelineCanvas', 'Task update failed:', error);
			new Notice(i18n.t(errorKey));
			return false;
		}
	}, [app, plugin, enabledFormats, refresh]);

	// ===== resize 提交（WYSIWYG，与周视图同规则） =====
	const commitResize = useCallback((
		block: TimeBlock,
		seg: TimeBlockSegment,
		edge: 'top' | 'bottom',
		newStartMin: number,
		newEndMin: number,
		blockEl: HTMLElement,
	): void => {
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (block.isPoint) {
			if (edge === 'top') {
				updates[startField] = atMinutes(newStartMin);
				updates[endField] = block.end;
			} else {
				updates[startField] = block.start;
				updates[endField] = atMinutes(newEndMin);
			}
			precision = { [startField]: 'time', [endField]: 'time' };
		} else if (edge === 'top') {
			updates[startField] = atMinutes(newStartMin);
			precision = { [startField]: 'time' };
		} else {
			updates[endField] = atMinutes(newEndMin);
			precision = { [endField]: 'time' };
		}

		void (async () => {
			const ok = await persistTaskUpdate(block.task, updates, precision, 'views.dayView.updateTimeFailed');
			if (!ok) {
				blockEl.style.top = `${winMinutesToPx(seg.startMin)}px`;
				blockEl.style.height = `${minutesToPx(seg.endMin - seg.startMin)}px`;
			}
		})();
	}, [atMinutes, startField, endField, persistTaskUpdate, winMinutesToPx]);

	const beginResize = useBlockResize(commitResize, { windowStartMin, windowEndMin });

	// ===== 整块拖放落点（minutes = 块上边缘吸附时刻） =====
	const commitBlockMove = useCallback((task: GCTask, minutes: number): void => {
		const interval = getTaskInterval(task, startField, endField);
		const updates: Partial<Record<DateFieldType, Date>> = {};
		let precision: Partial<Record<DateFieldType, 'day' | 'time'>> = {};

		if (interval && interval.kind === 'point') {
			// 拖动点任务 = 双写起止并自动升级为区间任务（与周视图同语义）
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const anchorMin = Math.max(0, Math.min(minutes, MINUTES_PER_DAY - durationMin));
			updates[startField] = atMinutes(anchorMin);
			updates[endField] = atMinutes(anchorMin + durationMin);
			precision = { [startField]: 'time', [endField]: 'time' };
		} else if (interval) {
			// 仅原本同日的区间做当日容纳钳制，跨夜区间允许继续跨夜
			const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
			const dayMsOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
			const dayStartOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
			const sameDayOrigin = dayMsOf(interval.start) === dayMsOf(interval.end);
			const anchorMin = sameDayOrigin && durationMin <= MINUTES_PER_DAY
				? Math.max(0, Math.min(minutes, MINUTES_PER_DAY - durationMin))
				: minutes;
			const newStart = atMinutes(anchorMin);
			const shiftMs = newStart.getTime() - interval.start.getTime();
			const startIsTime = task.datePrecision?.[startField] === 'time';
			const endIsTime = task.datePrecision?.[endField] === 'time';
			updates[startField] = startIsTime ? newStart : dayStartOf(newStart);
			const shiftedEnd = new Date(interval.end.getTime() + shiftMs);
			updates[endField] = endIsTime ? shiftedEnd : dayStartOf(shiftedEnd);
			precision = { ...task.datePrecision };
		} else {
			// 全天任务 / 外部视图拖入：落点即时刻；
			// 对端钳制：落点越过对端点所在日时钳到对端点日（保留落点时刻），避免制造倒置数据
			const anchorField = resolveAnchorDateField(task) ?? endField;
			updates[anchorField] = clampSingleFieldWrite(task, anchorField, atMinutes(minutes), startField, endField);
			precision = { [anchorField]: 'time' };
		}

		void persistTaskUpdate(task, updates, precision, 'views.dayView.updateTimeFailed');
	}, [atMinutes, startField, endField, persistTaskUpdate]);

	// 触屏整块拖动（长按 500ms 起拖；单日画布 dayIndex 恒为 0）
	const beginBlockTouchPress = useCanvasTouchDrag({
		// 日视图是时间轴画布，minutes 必为数值（null 仅在列表式布局出现，此处兜底为原起点）
		onCommit: (task, _dayIndex, minutes) => commitBlockMove(task, minutes ?? 0),
		setPreview: (prev) => setDropPreview(prev && { startMin: prev.startMin, endMin: prev.endMin }),
		columnSelector: `.${DayCanvasClasses.elements.canvas}`,
		// 分栏画布的落点换算必须加回窗口起点，否则右轴拖动会被算成左轴时刻
		windowStartMin,
	});

	// ===== 空白快速创建（单击 = 前向 1 小时区间，拖拽 = 选区） =====

	/** 光标处快速创建的可用终点（ghost 与创建同源）：钳到 24:00 与下一个块起点 */
	const quickCreateEnd = useCallback((min: number): number => {
		return clampForwardPointEnd(min, model.blocks.map((b) => b.seg));
	}, [model.blocks]);

	const handleQuickCreate = useCallback((payload: QuickCreate): void => {
		if (payload.type === 'range') {
			openCreateTaskModal({
				app,
				plugin,
				targetDate: day,
				targetRange: { start: atMinutes(payload.startMin), end: atMinutes(payload.endMin) },
				onSuccess: () => {},
			});
			return;
		}
		// 下方空隙不足默认时长时按空隙收缩（与 ghost 预览一致）；无空隙不弹窗
		const endMin = quickCreateEnd(payload.min);
		if (endMin <= payload.min) return;
		openCreateTaskModal({
			app,
			plugin,
			targetDate: day,
			targetRange: { start: atMinutes(payload.min), end: atMinutes(endMin) },
			onSuccess: () => {},
		});
	}, [app, plugin, day, atMinutes, quickCreateEnd]);

	const minutesFromEvent = useCallback((clientY: number): number => {
		const canvas = canvasRef.current;
		if (!canvas) return windowStartMin;
		const rect = canvas.getBoundingClientRect();
		// 窗口内像素 → 窗口内分钟 → 加回窗口起点得到绝对分钟
		return snapMinutes(pxToMinutes(clientY - rect.top) + windowStartMin, false);
	}, [windowStartMin]);

	const showGhost = useCallback((startMin: number, endMin: number, dragging: boolean): void => {
		const ghost = ghostRef.current;
		const label = ghostLabelRef.current;
		if (!ghost) return;
		// 钳到本窗口：预览不越出当前分栏
		const clampedStart = Math.max(startMin, windowStartMin);
		const clampedEnd = Math.min(Math.max(endMin, clampedStart + 1), windowEndMin);
		setCssProps(ghost, { display: 'block' });
		ghost.style.top = `${winMinutesToPx(clampedStart)}px`;
		ghost.style.height = `${minutesToPx(clampedEnd - clampedStart)}px`;
		ghost.classList.toggle(DayCanvasClasses.modifiers.ghostDragging, dragging);
		if (label) label.textContent = dragging
			? `${formatMinutes(clampedStart)} – ${formatMinutes(clampedEnd)}`
			: formatMinutes(clampedStart);
	}, [winMinutesToPx, windowStartMin, windowEndMin]);

	const hideGhost = useCallback((): void => {
		const ghost = ghostRef.current;
		if (ghost) setCssProps(ghost, { display: 'none' });
	}, []);

	// ===== hover ghost / 拖拽选区 =====
	const handlePointerMove = useCallback((e: ReactPointerEvent) => {
		if (isInsideBlock(e.target)) {
			if (!createRef.current) hideGhost();
			return;
		}
		const minutes = minutesFromEvent(e.clientY);
		const create = createRef.current;
		if (create) {
			// 触屏长按未完成：不绘制预览，移动由 touchmove 守卫判定是否为滚动
			if (!create.armed) return;
			create.lastMin = minutes;
			if (!create.moved && Math.abs(e.clientY - create.anchorY) > CREATE_DRAG_THRESHOLD_PX) {
				create.moved = true;
			}
			if (!create.moved) {
				showGhost(create.anchorMin, quickCreateEnd(create.anchorMin), true);
				return;
			}
			showGhost(Math.min(create.anchorMin, minutes), Math.max(create.anchorMin, minutes), true);
			return;
		}
		// 触屏手指在画布上移动属于滚动或长按等待，不显示 hover 预览
		if (e.pointerType === 'touch') {
			hideGhost();
			return;
		}
		// portal 浮层冒泡 / 菜单与 resize 进行中：不出 hover 提示。
		// ghost 终点钳到下一个块起点（与点击创建同源判定）：空隙不足 1 小时按空隙收缩，
		// 光标处即块起点（无空隙）则不显示
		const canvas = canvasRef.current;
		if (!canvas || !canvas.contains(e.target as Node)) {
			hideGhost();
			return;
		}
		if (isContextMenuOpen() || isBlockResizing()) {
			hideGhost();
			return;
		}
		const endMin = quickCreateEnd(minutes);
		if (endMin <= minutes) {
			hideGhost();
			return;
		}
		showGhost(minutes, endMin, false);
	}, [minutesFromEvent, showGhost, hideGhost, quickCreateEnd]);

	const handlePointerLeave = useCallback(() => {
		if (!createRef.current) hideGhost();
	}, [hideGhost]);

	/** 结束手势：统一清理监听、长按定时器、滚动拦截与预览 */
	const endCreateGesture = useCallback((): CreateGesture | null => {
		const create = createRef.current;
		createRef.current = null;
		document.removeEventListener('pointerup', onDocumentPointerUp);
		document.removeEventListener('pointercancel', onDocumentPointerCancel);
		if (create) {
			window.clearTimeout(create.timer);
			create.guard?.dispose();
		}
		hideGhost();
		return create;
	}, [hideGhost, onDocumentPointerUp, onDocumentPointerCancel]);

	const finishCreate = useCallback((): void => {
		const create = endCreateGesture();
		// 触屏短按：长按未完成时松手，不创建任务
		if (!create || !create.armed) return;
		if (create.moved && Math.abs(create.lastMin - create.anchorMin) >= MIN_DURATION_MIN) {
			handleQuickCreate({
				type: 'range',
				startMin: Math.min(create.anchorMin, create.lastMin),
				endMin: Math.max(create.anchorMin, create.lastMin),
			});
		} else {
			handleQuickCreate({ type: 'point', min: create.anchorMin });
		}
	}, [endCreateGesture, handleQuickCreate]);

	/** 触屏滚动接管手势（pointercancel）：静默放弃创建，不弹窗 */
	const cancelCreate = useCallback((): void => {
		endCreateGesture();
	}, [endCreateGesture]);
	finishCreateRef.current = finishCreate;
	cancelCreateRef.current = cancelCreate;

	// 组件卸载时清理未结束的手势，避免定时器、监听与 touch-action 残留
	useEffect(() => () => {
		endCreateGesture();
	}, [endCreateGesture]);

	const handlePointerDown = useCallback((e: ReactPointerEvent) => {
		if (e.button !== 0 || isInsideBlock(e.target)) return;
		if (isContextMenuOpen()) return;
		const canvas = canvasRef.current;
		if (!canvas || !canvas.contains(e.target as Node)) return;
		if (createRef.current) return; // 已有手势在进行（例如第二根手指按下）
		const isTouch = e.pointerType === 'touch';
		const anchorMin = minutesFromEvent(e.clientY);
		const endMin = quickCreateEnd(anchorMin);
		if (endMin <= anchorMin) return; // 光标处即下一个块起点：无空隙，不启动创建手势
		const create: CreateGesture = {
			anchorMin,
			anchorX: e.clientX,
			anchorY: e.clientY,
			lastMin: anchorMin,
			moved: false,
			armed: !isTouch,
			timer: 0,
			guard: null,
		};
		createRef.current = create;
		document.removeEventListener('pointerup', onDocumentPointerUp);
		document.removeEventListener('pointercancel', onDocumentPointerCancel);
		document.addEventListener('pointerup', onDocumentPointerUp);
		document.addEventListener('pointercancel', onDocumentPointerCancel);

		if (!isTouch) {
			e.preventDefault();
			showGhost(anchorMin, endMin, true);
			return;
		}

		// 触屏：按下时既不显示预览也不阻止滚动，等长按完成再接管手势
		create.guard = attachTouchScrollGuard(canvas, {
			originX: e.clientX,
			originY: e.clientY,
			isArmed: () => !!createRef.current?.armed,
			onAbandon: () => cancelCreateRef.current(),
		});
		create.timer = window.setTimeout(() => {
			const active = createRef.current;
			if (!active || active !== create) return;
			active.armed = true;
			active.guard?.arm();
			navigator.vibrate?.(10);
			showGhost(active.anchorMin, quickCreateEnd(active.anchorMin), true);
		}, LONG_PRESS_MS);
	}, [minutesFromEvent, showGhost, quickCreateEnd, onDocumentPointerUp, onDocumentPointerCancel]);

	// ===== HTML5 拖放（块拖动按块边缘落点 + 预览块；外部拖入按指针 + 指示线） =====
	const handleDragOver = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		setDragOver(true);
		const meta = getBlockDragMeta();
		if (meta) {
			setDropLine(null);
			const canvas = canvasRef.current;
			if (!canvas) return;
			const topMin = snapMinutes(pxToMinutes(e.clientY - meta.offsetPx - canvas.getBoundingClientRect().top) + windowStartMin, false);
			const endMin = Math.min(topMin + meta.durationMin, windowEndMin);
			setDropPreview((prev) => (prev && prev.startMin === topMin ? prev : { startMin: topMin, endMin }));
			return;
		}
		setDropPreview(null);
		setDropLine(minutesFromEvent(e.clientY));
	}, [minutesFromEvent, setDropLine, setDropPreview, windowStartMin, windowEndMin]);

	const handleDragLeave = useCallback((e: ReactDragEvent) => {
		const related = e.relatedTarget as Node | null;
		if (related && e.currentTarget.contains(related)) return;
		setDropLine(null);
		setDropPreview(null);
		setDragOver(false);
	}, [setDropLine, setDropPreview]);

	const handleDrop = useCallback((e: ReactDragEvent) => {
		e.preventDefault();
		setDropLine(null);
		setDropPreview(null);
		setDragOver(false);
		const taskId = e.dataTransfer?.getData('taskId');
		if (!taskId) return;
		const task = findTaskById(tasks, taskId);
		if (!task) {
			Logger.error('DayTimelineCanvas', 'Drop source task not found:', taskId);
			return;
		}
		const meta = getBlockDragMeta();
		const topEdgeClientY = meta ? e.clientY - meta.offsetPx : e.clientY;
		commitBlockMove(task, minutesFromEvent(topEdgeClientY));
	}, [tasks, minutesFromEvent, commitBlockMove]);

	// ===== 当前时间指示线（仅画布日为今天时显示；30s 刷新） =====
	const isToday = useMemo(() => {
		const now = new Date();
		const d0 = new Date(day);
		return now.getFullYear() === d0.getFullYear() && now.getMonth() === d0.getMonth() && now.getDate() === d0.getDate();
	}, [day]);

	const [nowTick, setNowTick] = useState(0);
	useEffect(() => {
		if (!isToday) return;
		const timer = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
		return () => window.clearInterval(timer);
	}, [isToday]);

	// 当前时间线：仅当「今天」且当前时刻落在本窗口内才显示（nowTick 驱动 30s 刷新）
	const nowTop = useMemo(() => {
		if (!isToday) return null;
		const now = new Date();
		const nowMin = now.getHours() * 60 + now.getMinutes();
		if (nowMin < windowStartMin || nowMin > windowEndMin) return null;
		return winMinutesToPx(nowMin);
	}, [isToday, model, nowTick, windowStartMin, windowEndMin, winMinutesToPx]);

	const canvasCls = [
		DayCanvasClasses.elements.canvas,
		dragOver ? DayCanvasClasses.modifiers.canvasDragOver : '',
	].filter(Boolean).join(' ');

	// 窗口内的小时刻度
	const hourMarks = useMemo(() => {
		const marks: number[] = [];
		for (let h = Math.floor(windowStartMin / 60); h < Math.ceil(windowEndMin / 60); h++) {
			if (h * 60 >= windowStartMin && h * 60 <= windowEndMin) marks.push(h);
		}
		return marks;
	}, [windowStartMin, windowEndMin]);

	return (
		<div className={DayCanvasClasses.block}>
			<div className={DayCanvasClasses.elements.body}>
				{/* 时间沟槽 */}
				<div className={DayCanvasClasses.elements.gutter}>
					{hourMarks.map((hour) => (
						<div key={hour} className={DayCanvasClasses.elements.timeLabel}>
							{`${String(hour).padStart(2, '0')}:00`}
						</div>
					))}
				</div>
				{/* 连续画布（高度 = 本窗口时长） */}
				<div
				ref={canvasRef}
				data-day-idx={0}
				className={canvasCls}
				style={{ height: `${windowPx}px`, '--gc-tl-hour-h': `${HOUR_PX}px` } as CSSProperties}
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
				onPointerDown={handlePointerDown}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{model.blocks.map(({ block, seg }) => {
					// 块与窗口求交：完全在窗口外则跳过
					if (seg.endMin <= windowStartMin || seg.startMin >= windowEndMin) return null;
					const clippedStart = Math.max(seg.startMin, windowStartMin);
					const clippedEnd = Math.min(seg.endMin, windowEndMin);
					const durationMin = clippedEnd - clippedStart;
					if (durationMin <= 0) return null;
					const continuesBefore = seg.continuesBefore || seg.startMin < windowStartMin;
					const continuesAfter = seg.continuesAfter || seg.endMin > windowEndMin;
					const resizable = !isVirtualTask(block.task);
					/**
					 * 真实边缘 vs 裁剪假边缘：
					 * 跨窗口的块会在分栏边界被裁掉一截，那个边缘是「显示裁剪线」而非任务的真实起止。
					 * 拖假边缘会写出错误时间（它不代表任何真实时刻），因此只允许拖真实边缘。
					 * 需要改跨 12:00 的块 → 用编辑面板手动改（画布下方已有灰字说明）。
					 */
					const realTopEdge = !continuesBefore;
					const realBottomEdge = !continuesAfter;
					const cls = [
						DayCanvasClasses.elements.block,
						continuesBefore ? DayCanvasClasses.modifiers.blockContinuesBefore : '',
						continuesAfter ? DayCanvasClasses.modifiers.blockContinuesAfter : '',
						seg.stackedIndex > 0 ? DayCanvasClasses.modifiers.blockStacked : '',
					].filter(Boolean).join(' ');
					const style: CSSProperties = {
						top: `${winMinutesToPx(clippedStart)}px`,
						height: `${minutesToPx(durationMin)}px`,
						left: `calc(${(seg.lane / seg.laneCount) * 100}% + ${(seg.stackedIndex > 0 ? seg.stackedIndex * 3 : 0) + 1}px)`,
						width: `calc(${100 / seg.laneCount}% - 2px)`,
						zIndex: seg.lane + (seg.stackedIndex > 0 ? 4 : 1),
					};
					return (
						<div
							key={`${block.task.filePath}:${block.task.lineNumber}`}
							className={cls}
							style={style}
							onPointerDown={(e) => beginBlockTouchPress(e, block, e.currentTarget)}
							onDragStart={(e) => {
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
							{durationMin >= 30 ? (
								<span className={DayCanvasClasses.elements.blockTime}>
									{`${formatMinutes(clippedStart)} – ${formatMinutes(clippedEnd)}`}
								</span>
							) : null}
							<TaskCard task={block.task} config={config} disableLongPressMenu />
							{realTopEdge && resizable ? (
								<div
									className={`${DayCanvasClasses.elements.handle} ${DayCanvasClasses.modifiers.handleTop}`}
									onPointerDown={(e) => {
										const canvas = canvasRef.current;
										if (canvas && e.currentTarget.parentElement) {
											beginResize(e, block, seg, 'top', canvas, e.currentTarget.parentElement);
										}
									}}
								/>
							) : null}
							{realBottomEdge && resizable ? (
								<div
									className={`${DayCanvasClasses.elements.handle} ${DayCanvasClasses.modifiers.handleBottom}`}
									onPointerDown={(e) => {
										const canvas = canvasRef.current;
										if (canvas && e.currentTarget.parentElement) {
											beginResize(e, block, seg, 'bottom', canvas, e.currentTarget.parentElement);
										}
									}}
								/>
							) : null}
						</div>
					);
				})}
				{/* 拖放吸附指示线（外部来源） */}
				{dropLine !== null ? (
					<div className={DayCanvasClasses.elements.dropLine} style={{ top: `${winMinutesToPx(dropLine)}px` }} />
				) : null}
				{/* 整块拖动落点预览 */}
				{dropPreview ? (
					<div
						className={DayCanvasClasses.elements.dropPreview}
						style={{ top: `${winMinutesToPx(dropPreview.startMin)}px`, height: `${minutesToPx(dropPreview.endMin - dropPreview.startMin)}px` }}
					>
						<span className={DayCanvasClasses.elements.ghostLabel}>
							{`${formatMinutes(dropPreview.startMin)} – ${formatMinutes(dropPreview.endMin)}`}
						</span>
					</div>
				) : null}
				{/* 当前时间指示线 */}
				{nowTop !== null ? (
					<div className={DayCanvasClasses.elements.currentTime} style={{ top: nowTop }} />
				) : null}
				{/* 空白快速创建 ghost */}
				<div ref={ghostRef} className={DayCanvasClasses.elements.ghost} style={{ display: 'none' }}>
					<span ref={ghostLabelRef} className={DayCanvasClasses.elements.ghostLabel} />
					<span className={DayCanvasClasses.elements.ghostPlus}><Icon icon="plus" /></span>
				</div>
			</div>
			</div>
			{/* 分栏模式（非整天窗口）才需要说明：跨 12:00 的块被裁切成两段 */}
			{isSplitWindow ? (
				<div className={DayCanvasClasses.elements.hint}>
					{i18n.t('views.dayView.splitCanvasHint')}
				</div>
			) : null}
		</div>
	);
}
