import { memo, useMemo, type CSSProperties, type JSX } from 'react';
import type { GCTask } from '../../types';
import type { TaskCardConfig } from '../../components/TaskCard/TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses, ContextMenuClasses } from '../../utils/bem';
import { isVirtualTask, getVirtualMetadata } from '../../tasks/virtualTaskGenerator';
import { getStatusColor, DEFAULT_TASK_STATUSES, getCurrentThemeMode, ALL_BUILTIN_STATUSES, type TaskStatus } from '../../tasks/taskStatus';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { toISOStringLocal } from '../../dateUtils/timezone';
import { usePlugin, useApp } from '../pluginContext';
import { DescriptionWithLinks } from './DescriptionWithLinks';
import { TagPillSpan } from './TagPillSpan';
import { ContextMenuTrigger, type ContextMenuSection } from './ContextMenu';
import { useTaskTooltip } from './TooltipProvider';
import { useDragSource } from '../utils/useDragAndDrop';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { isTouchNow } from '../utils/platform';
import { openEditTaskModal } from '../modals/TaskFormModal';
import { createNoteFromTask } from '../../contextMenu/commands/createNoteFromTask';
import { createNoteFromTaskAlias } from '../../contextMenu/commands/createNoteFromTaskAlias';
import { postponeTask } from '../../contextMenu/commands/postponeTask';
import { deleteTask } from '../../contextMenu/commands/deleteTask';
import { setTaskStatus } from '../../contextMenu/commands/setTaskStatus';
import { i18n } from '../../i18n/i18n';

export interface ReactTaskCardProps {
	task: GCTask;
	config: TaskCardConfig;
	targetDate?: Date;
	onClick?: (task: GCTask) => void;
	onRefresh?: () => void;
	/** 容器自管触屏长按手势时，禁用卡片内置长按菜单（如时间画布拖动） */
	disableLongPressMenu?: boolean;
}

function formatDateForDisplay(date: Date, precision?: 'day' | 'time'): string {
	if (precision === 'time') {
		return formatDate(date, 'yyyy-MM-dd HH:mm');
	}
	return formatDate(date, 'yyyy-MM-dd');
}

/**
 * React 任务卡片组件
 * 输出与原 TaskCardComponent 完全一致的 DOM 结构与 BEM 类名
 */
// memo：tasks 数组引用每次刷新都会变化，但未变化的任务卡片
//（props 中 task/config/回调均稳定）应跳过重渲染——
// 调用方需用 useCallback 稳定 onRefresh，否则 memo 无效
export const TaskCard = memo(function TaskCard({ task, config, targetDate, onClick, onRefresh, disableLongPressMenu }: ReactTaskCardProps): JSX.Element {
	const plugin = usePlugin();
	const app = useApp();
	const virtual = isVirtualTask(task);
	const tooltip = useTaskTooltip();

	// ===== 类名组装 =====
	const classes = useMemo(() => {
		const list = [TaskCardClasses.block];
		const viewKey = `${config.viewModifier}View` as keyof typeof TaskCardClasses.modifiers;
		const mod = TaskCardClasses.modifiers[viewKey];
		if (mod) list.push(mod);
		if (config.variant === 'timeline') list.push(TaskCardClasses.modifiers.timeline);
		if (config.compact) list.push(TaskCardClasses.modifiers.compact);
		if (virtual) list.push(TaskCardClasses.modifiers.virtual);
		else if (task.repeat) list.push(TaskCardClasses.modifiers.recurring);
		// 状态只做颜色标签，不再有 completed/pending 语义分支
		if (task.status) list.push('task-with-status');
		return list;
	}, [config.viewModifier, config.variant, config.compact, virtual, task.repeat, task.status]);

	// ===== 状态颜色 =====
	const style = useMemo<CSSProperties | undefined>(() => {
		if (!task.status) return undefined;
		const statuses = plugin.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		const colors = getStatusColor(task.status, statuses, getCurrentThemeMode());
		if (!colors) return undefined;
		return {
			'--task-bg-color': colors.bg,
			'--task-text-color': colors.text,
		} as CSSProperties;
	}, [task.status, plugin.settings]);

	// ===== 富文本描述 =====
	const description = useMemo(() => {
		if (!config.showDescription) return null;
		const gf = (plugin.settings.globalTaskFilter || '').trim();
		const textCls = [TaskCardClasses.elements.text];
		if (config.maxLines) textCls.push(TaskCardClasses.modifiers.textLimited);
		const style: CSSProperties | undefined = config.maxLines
			? ({ ['--max-lines']: String(config.maxLines) } as CSSProperties)
			: undefined;
		return (
			<div className={textCls.join(' ')} style={style}>
				{plugin.settings.showGlobalFilterInTaskText && gf ? `${gf} ` : ''}
				<DescriptionWithLinks text={task.description} app={app} />
			</div>
		);
	}, [config.showDescription, config.maxLines, plugin.settings, task.description, app]);

	// ===== 右键菜单（声明式 sections，复用 contextMenu 命令模块） =====
	const menuSections = useMemo<ContextMenuSection[]>(() => {
		if (virtual) return [];
		const enabledFormats = plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = plugin.settings.taskNotePath || 'Tasks';
		const refresh = onRefresh || (() => {});
		// 状态段数据源：设置里的全部状态（默认 + 用户自定义）。
		// 兜底用 ALL_BUILTIN_STATUSES 而非 DEFAULT_TASK_STATUSES——后者只有 todo/done 两项，
		// 一旦设置未就绪，菜单会静默退化成"只有两个状态"的表象。
		const statuses: TaskStatus[] = plugin.settings?.taskStatuses?.length
			? plugin.settings.taskStatuses
			: ALL_BUILTIN_STATUSES;
		const currentStatusKey = task.status ?? (DEFAULT_TASK_STATUSES[0]?.key ?? 'important');

		const postponeOptions = [
			{ days: 1, label: i18n.t('contextMenu.postpone.days1') },
			{ days: 3, label: i18n.t('contextMenu.postpone.days3') },
			{ days: 7, label: i18n.t('contextMenu.postpone.days7') },
		];
		const setDueDateOptions = [
			{ days: 1, label: i18n.t('contextMenu.setDueDate.tomorrow') },
			{ days: 3, label: i18n.t('contextMenu.setDueDate.days3') },
			{ days: 7, label: i18n.t('contextMenu.setDueDate.days7') },
		];

		return [
			{
				items: [{
					key: 'edit',
					title: i18n.t('contextMenu.editTask'),
					icon: 'pencil',
					onClick: () => {
						openEditTaskModal(app, task, enabledFormats, refresh, true);
					},
				}],
			},
			{
				items: [
					{
						key: 'createNote',
						title: i18n.t('contextMenu.createNote'),
						icon: 'file-plus',
						onClick: () => {
							void createNoteFromTask(app, task, taskNotePath, enabledFormats);
						},
					},
					{
						key: 'createNoteAlias',
						title: i18n.t('contextMenu.createNoteAlias'),
						icon: 'file-plus',
						onClick: () => {
							void createNoteFromTaskAlias(app, task, taskNotePath, enabledFormats);
						},
					},
				],
			},
			{
				// 状态段：列出设置里的全部状态（默认 + 用户自定义），对勾标出当前状态。
				// 此前只硬编码 important/question 两项，用户自建的状态在右键菜单里完全无法触达。
				title: i18n.t('contextMenu.statusLabel'),
				items: statuses.map((st) => ({
					key: `status-${st.key}`,
					title: (
						<>
							<span
								className={ContextMenuClasses.statusDot}
								style={{ backgroundColor: getStatusColor(st.key, statuses)?.bg }}
							/>
							{st.name}
						</>
					),
					checked: currentStatusKey === st.key,
					onClick: () => {
						void setTaskStatus(app, task, st.key, enabledFormats, refresh);
					},
				})),
			},
			{
				items: [
					...postponeOptions.map((o) => ({
						key: `postpone-${o.days}`,
						title: o.label,
						icon: 'calendar-clock',
						onClick: () => {
							void postponeTask(app, task, o.days, enabledFormats, refresh, false);
						},
					})),
					...setDueDateOptions.map((o) => ({
						key: `due-${o.days}`,
						title: o.label,
						icon: 'calendar-check',
						onClick: () => {
							void postponeTask(app, task, o.days, enabledFormats, refresh, true);
						},
					})),
				],
			},
			{
				items: [
					{
						key: 'delete',
						title: i18n.t('contextMenu.deleteTask'),
						icon: 'trash',
						onClick: () => {
							void deleteTask(app, task, refresh);
						},
					},
				],
			},
		];
	}, [task, app, plugin.settings.enabledTaskFormats, plugin.settings.taskNotePath, plugin.settings.taskStatuses, virtual, onRefresh]);

	// ===== 拖拽（useDragSource 封装） =====
	const dragProps = useDragSource({
		taskId: `${task.filePath}:${task.lineNumber}`,
		enabled: !!config.enableDrag && !virtual,
		onDragStart: () => tooltip.cancel(),
	});

	// ===== 交互事件 =====
	// 点击行为由设置决定（跳转源文件 / 编辑面板）；重复任务虚拟实例一律跳回源任务，
	// 因为编辑面板需要真实行号定位
	const handleClick = () => {
		if (virtual) {
			void (async () => {
				const meta = getVirtualMetadata(task);
				if (meta?.sourceTaskId) {
					const [filePath, lineStr] = meta.sourceTaskId.split(':');
					await openFileInExistingLeaf(app, filePath, parseInt(lineStr));
				}
				onClick?.(task);
			})();
			return;
		}
		if (!config.clickable) return;
		if (plugin.settings.taskCardClickAction === 'editModal') {
			// 与右键菜单「编辑任务」同一入口，保证编辑态一致
			openEditTaskModal(app, task, plugin.settings.enabledTaskFormats || ['tasks'], onRefresh || (() => {}), true);
			onClick?.(task);
			return;
		}
		void (async () => {
			await openFileInExistingLeaf(app, task.filePath, task.lineNumber);
			onClick?.(task);
		})();
	};

	// ===== 子元素 =====
	const metadataBlock = task.metadataFields && task.metadataFields.length > 0 ? (
		<div className={TaskCardClasses.elements.metadata}>
			{task.metadataFields.map((f, idx) => (
				<div key={idx} className={TaskCardClasses.elements.metadataItem}>
					<span className={TaskCardClasses.elements.metadataKey}>{f.key}:</span>
					<span className={TaskCardClasses.elements.metadataValue}>{f.value || i18n.t('common.empty')}</span>
				</div>
			))}
		</div>
	) : null;

	const timeBadges = (() => {
		if (!config.showTimes || !config.timeFields) return null;
		const tc = config.timeFields;
		if (!tc.showCreated && !tc.showStart && !tc.showScheduled && !tc.showDue) {
			return null;
		}
		const dp = task.datePrecision || {};
		const isOverdue = !!tc.showOverdueIndicator && !!task.dueDate && task.dueDate < new Date();
		const badges: Array<{ key: keyof typeof dp; label: string; date?: Date; cls: string; overdue?: boolean; show: boolean }> = [
			{ key: 'createdDate', label: i18n.t('taskCard.created'), date: task.createdDate, cls: TimeBadgeClasses.created, show: !!tc.showCreated },
			{ key: 'startDate', label: i18n.t('taskCard.start'), date: task.startDate, cls: TimeBadgeClasses.start, show: !!tc.showStart },
			{ key: 'scheduledDate', label: i18n.t('taskCard.scheduled'), date: task.scheduledDate, cls: TimeBadgeClasses.scheduled, show: !!tc.showScheduled },
			{ key: 'dueDate', label: i18n.t('taskCard.due'), date: task.dueDate, cls: TimeBadgeClasses.due, overdue: isOverdue, show: !!tc.showDue },
		];
		return (
			<div className={TaskCardClasses.elements.times}>
				{badges.map((b) => {
					if (!b.show || !b.date) return null;
					return (
						<span key={b.key} className={`${TaskCardClasses.elements.timeBadge} ${b.cls}${b.overdue ? ` ${TimeBadgeClasses.overdue}` : ''}`}>
							{b.label}:{formatDateForDisplay(b.date, dp[b.key])}
						</span>
					);
				})}
			</div>
		);
	})();

	const tags = config.showTags && task.tags && task.tags.length > 0 ? (
		<div className={TaskCardClasses.elements.tags}>
			{(config.maxTags && config.maxTags > 0 ? task.tags.slice(0, config.maxTags) : task.tags).map((t) => (
				<TagPillSpan key={t} label={t} showHash />
			))}
			{config.maxTags && config.maxTags > 0 && task.tags.length > config.maxTags ? (
				<span
					className={TaskCardClasses.elements.tagsOverflow}
					title={task.tags.slice(config.maxTags).map((t) => `#${t}`).join(' ')}
				>
					{`+${task.tags.length - config.maxTags}`}
				</span>
			) : null}
		</div>
	) : null;

	const fileLocation = config.showFileLocation ? (
		<span className={TaskCardClasses.elements.file}>{`${task.fileName}:${task.lineNumber}`}</span>
	) : null;

	const warning = config.showWarning && task.warning ? (
		<span className={TaskCardClasses.elements.warning} title={task.warning}>
			⚠️
		</span>
	) : null;

	// ===== 组装 =====
	const cardContent = (
		<div
			className={classes.join(' ')}
			style={style}
			draggable={dragProps.draggable}
			data-task-id={dragProps['data-task-id']}
			data-target-date={config.enableDrag && targetDate ? toISOStringLocal(targetDate) : undefined}
			onClick={(e) => {
				// 点击复选框不触发打开任务文件
				if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'checkbox') {
					return;
				}
				handleClick();
			}}
			onDragStart={dragProps.onDragStart}
			onDragEnd={dragProps.onDragEnd}
			onMouseEnter={(e) => {
				if (config.enableTooltip && !isTouchNow()) {
					tooltip.show(task, e.currentTarget, config.tooltipFollowMouse ? { x: e.clientX, y: e.clientY } : undefined);
				}
			}}
			onMouseLeave={() => tooltip.hide()}
			onContextMenu={() => tooltip.cancel()}
		>
			{description}
			{config.showTicktick ? (
				<>
					{task.ticktick ? <div className={TaskCardClasses.elements.ticktick}>{task.ticktick}</div> : null}
					{metadataBlock}
				</>
			) : null}
			{task.repeat ? <span className={TaskCardClasses.elements.repeatIndicator}>🔁</span> : null}
			{tags}
			{timeBadges}
			{fileLocation}
			{warning}
		</div>
	);

	// 虚拟任务无右键菜单，直接渲染
	if (virtual) return cardContent;

	return (
		<ContextMenuTrigger sections={menuSections} longPressDisabled={disableLongPressMenu}>
			{cardContent}
		</ContextMenuTrigger>
	);
});

