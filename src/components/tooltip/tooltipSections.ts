/**
 * 任务悬浮卡片内容构建（框架无关纯函数）
 *
 * React TooltipProvider 与命令式 TooltipManager 共用，
 * 保证两端分组顺序与字段永不漂移：时间 → 优先级 → 标签 → 元数据 → 文件位置。
 */

import type { GCTask } from '../../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { i18n } from '../../i18n/i18n';

export interface TooltipPropRow {
	label: string;
	value: string;
	valueClass?: string;
	isOverdue?: boolean;
}

export interface TooltipSection {
	key: string;
	rows: TooltipPropRow[];
}

/** 悬浮窗详情最多显示的行数（超出折叠为「…还有 N 行」） */
export const TOOLTIP_DETAIL_MAX_LINES = 4;

export interface TooltipDetailsSummary {
	/** 待显示的行（已去掉 == 高亮符号，最多 MAX_LINES 行） */
	lines: string[];
	/** 被折叠的行数（0 表示全部显示） */
	hiddenCount: number;
}

/**
 * 把任务详情压成悬浮窗用的摘要。
 *
 * - 去掉 Obsidian 高亮语法 `==文字==` 的等号（用户要求不加背景色，只留纯文字）
 * - **保留行首缩进**（Tab/空格），让悬浮窗里的层级与笔记一致
 * - 最多保留 {@link TOOLTIP_DETAIL_MAX_LINES} 行，其余计数折叠
 *
 * @returns 无详情时返回 null
 */
export function buildTooltipDetails(task: GCTask): TooltipDetailsSummary | null {
	const raw = task.details;
	if (!raw || !raw.trim()) return null;

	const all = raw
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line
			// 去掉高亮符号：==文字== → 文字
			.replace(/==([^=]*)==/g, '$1')
			// 去掉残留的孤立 ==
			.replace(/==/g, '')
			// 只去行尾空白，保留行首缩进层级
			.trimEnd())
		.filter((line) => line.trim() !== '');

	if (all.length === 0) return null;

	const lines = all.slice(0, TOOLTIP_DETAIL_MAX_LINES);
	const hiddenCount = Math.max(0, all.length - lines.length);
	return { lines, hiddenCount };
}

export function buildTooltipSections(task: GCTask): TooltipSection[] {
	const sections: TooltipSection[] = [];

	const timeRows: TooltipPropRow[] = [];
	const pushTime = (date: Date | undefined, label: string, precision?: 'day' | 'time') => {
		if (!date) return;
		timeRows.push({ label, value: formatDate(date, precision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
	};
	pushTime(task.createdDate, i18n.t('taskCard.created'), task.datePrecision?.createdDate);
	pushTime(task.startDate, i18n.t('taskCard.start'), task.datePrecision?.startDate);
	pushTime(task.scheduledDate, i18n.t('taskCard.scheduled'), task.datePrecision?.scheduledDate);
	if (task.dueDate) {
		timeRows.push({
			label: i18n.t('taskCard.due'),
			value: formatDate(task.dueDate, task.datePrecision?.dueDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'),
			isOverdue: task.dueDate < new Date(),
		});
	}
	if (task.repeat) timeRows.push({ label: i18n.t('taskCard.repeat'), value: task.repeat });
	if (timeRows.length > 0) sections.push({ key: 'time', rows: timeRows });

	if (task.tags && task.tags.length > 0) sections.push({ key: 'tags', rows: [] });

	if (task.metadataFields && task.metadataFields.length > 0) {
		sections.push({
			key: 'metadata',
			rows: task.metadataFields.map((f) => ({ label: f.key, value: f.value || i18n.t('taskCard.emptyValue') })),
		});
	}

	sections.push({
		key: 'file',
		rows: [{ label: i18n.t('taskCard.fileLocation'), value: `${task.fileName}:${task.lineNumber}` }],
	});

	return sections;
}
