/**
 * Daily Note Helper
 *
 * 处理 Daily Note 的检测、创建和任务插入逻辑
 */

import { App, Notice, TFile, TFolder } from 'obsidian';
import type { GanttCalendarSettings } from '../settings';
import { i18n } from '../i18n/i18n';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { Logger } from './logger';
import type { DailyNoteIndex } from './dailyNoteSettingsBridge';
import { getDailyNote as getDailyNoteFromIndex, createDailyNote } from 'obsidian-daily-notes-interface';
import { showConfirmDialog } from '../ui/modals/ConfirmDialog';
import type { TaskStatus } from '../tasks/taskStatus';
import { ALL_BUILTIN_STATUSES, getStatusByKey } from '../tasks/taskStatus';
import { formatDetailLines } from '../tasks/taskDetails';

/**
 * 搜索结果接口
 */
export interface DailyNoteSearchResult {
	file: TFile;
	relativePath: string; // 相对于指定根文件夹的路径
}

/**
 * 递归搜索指定文件夹及其子文件夹中的 Daily Note 文件
 *
 * @param app Obsidian App 实例
 * @param rootFolderPath 根文件夹路径
 * @param fileName 目标文件名（如 '2026-01-23.md'）
 * @returns 找到的文件信息，如果未找到则返回 null
 */
export function findDailyNoteRecursive(
	app: App,
	rootFolderPath: string,
	fileName: string
): DailyNoteSearchResult | null {
	const rootFolder = app.vault.getAbstractFileByPath(rootFolderPath);

	if (!rootFolder || !(rootFolder instanceof TFolder)) {
		return null;
	}

	// 使用深度优先搜索递归查找
	return searchFolderRecursive(rootFolder, fileName, rootFolderPath);
}

/**
 * 递归搜索文件夹
 */
function searchFolderRecursive(
	folder: TFolder,
	targetFileName: string,
	rootPath: string
): DailyNoteSearchResult | null {
	// 检查文件夹中的所有子文件
	for (const child of folder.children) {
		// 如果是目标文件，直接返回
		if (child instanceof TFile && child.name === targetFileName) {
			return {
				file: child,
				relativePath: child.path.substring(rootPath.length + 1)
			};
		}

		// 如果是子文件夹，递归搜索
		if (child instanceof TFolder) {
			const result = searchFolderRecursive(child, targetFileName, rootPath);
			if (result) {
				return result;
			}
		}
	}

	return null;
}

/**
 * 新任务数据接口
 */
export interface CreateTaskData {
	description: string;
	/** 任务详情：任务行下方的多行内容（写入时统一缩进） */
	details?: string;
	repeat?: string;
	/**
	 * 任务要写入的目标日记日期。
	 * 未显式传入时回退到 createdDate，再回退到今天。
	 * 该日期决定写入哪一天的 Daily Note，与任务自身的 due/start 无关。
	 */
	targetDate?: Date | null;
	createdDate: Date;
	/**
	 * 任务状态（复选框符号所在的状态 key）。
	 * 未传时取 'todo'（复选框写空格）。用于把 [/] [-] [!] 等状态在建任务时就写对，
	 * 否则新任务永远是「未开始」，用户还得再右键改一次。
	 */
	status?: string;
	startDate?: Date | null;
	scheduledDate?: Date | null;
	dueDate: Date;
	completionDate?: Date | null;
	cancelledDate?: Date | null;
	tags?: string[];
	datePrecision?: Record<string, 'day' | 'time'>;
}

/**
 * 解析任务应写入哪一天的日记。
 *
 * 优先级：显式 targetDate → createdDate → 今天。
 * 只取年月日，时刻归零，避免同一自然日内因时分秒不同而找不到日记。
 */
export function resolveDailyNoteDate(taskData: CreateTaskData): Date {
	const base = taskData.targetDate || taskData.createdDate || new Date();
	const day = new Date(base.getTime());
	if (isNaN(day.getTime())) return getStartOfToday();
	day.setHours(0, 0, 0, 0);
	return day;
}

/** 今天零点（本地时区） */
function getStartOfToday(): Date {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today;
}

/**
 * 在 Daily Note 中创建任务
 * 支持 Obsidian 核心日记插件、Periodic Notes 插件和手动配置
 *
 * @param app Obsidian App 实例
 * @param taskData 任务数据
 * @param settings 插件设置
 * @param dailyNoteIndex 日记索引缓存（Obsidian 模式时使用）
 * @returns 任务写入的目标文件路径；用户取消或写入失败时返回 null
 */
export async function createTaskInDailyNote(
	app: App,
	taskData: CreateTaskData,
	settings: GanttCalendarSettings,
	dailyNoteIndex?: DailyNoteIndex
): Promise<string | null> {
	// 写入哪一天的日记由任务的目标日期决定，而不是"当前时间"。
	// 修复：在日历/甘特里给过去某天（如 18 号）建任务，任务却被写进今天的日记。
	const noteDate = resolveDailyNoteDate(taskData);

	if (settings.followObsidianDailyNote && dailyNoteIndex) {
		// Obsidian 模式：使用 obsidian-daily-notes-interface
		const momentDate = window.moment(noteDate);
		const dailyNotes = dailyNoteIndex.getIndex();
		let file = getDailyNoteFromIndex(momentDate, dailyNotes);

		if (!file) {
			// 弹出确认对话框
			const confirmed = await showConfirmDialog(
				app, 'Daily Note 不存在',
				`${formatDate(noteDate, 'yyyy-MM-dd')} 的 Daily Note 尚未创建，是否现在创建？`,
				{ confirmText: '创建', cancelText: '取消' }
			);
			if (!confirmed) {
				new Notice(i18n.t('dailyNote.createCancelled'));
				return null;
			}
			file = await createDailyNote(momentDate);
			dailyNoteIndex.invalidate();
		}

		if (file) {
			await insertTaskToFile(app, file, taskData, settings.newTaskHeading);
			new Notice(i18n.t('dailyNote.taskAdded'));
			return file.path;
		}
		return null;
	}

	// 手动模式
	const { dailyNotePath, dailyNoteNameFormat, newTaskHeading } = settings;

	// 修复嵌套文件夹格式 bug：提取纯文件名用于搜索
	const fullFormatResult = formatDate(noteDate, dailyNoteNameFormat);
	const fileName = fullFormatResult.split('/').pop()! + '.md';

	const searchResult = findDailyNoteRecursive(app, dailyNotePath, fileName);

	if (searchResult) {
		await insertTaskToFile(app, searchResult.file, taskData, newTaskHeading);
		return searchResult.file.path;
	} else {
		// 创建新文件时使用完整格式路径（支持嵌套文件夹）
		const filePath = `${dailyNotePath}/${fullFormatResult}.md`;
		return await handleMissingDailyNote(app, filePath, taskData, settings, noteDate);
	}
}

/**
 * 处理 Daily Note 不存在的情况
 * @returns 任务写入的目标文件路径；用户取消或失败时返回 null
 */
async function handleMissingDailyNote(
	app: App,
	filePath: string,
	taskData: CreateTaskData,
	settings: GanttCalendarSettings,
	noteDate: Date
): Promise<string | null> {
	// 弹出确认对话框
	const confirmed = await showConfirmDialog(
		app, 'Daily Note 不存在',
		`${formatDate(noteDate, 'yyyy-MM-dd')} 的 Daily Note 尚未创建，是否现在创建？`,
		{ confirmText: '创建', cancelText: '取消' }
	);

	if (!confirmed) {
		new Notice(i18n.t('dailyNote.createCancelled'));
		return null;
	}

	try {
		await createDailyNoteFromTemplate(app, filePath, settings.dailyNoteTemplatePath, noteDate);

		// 创建后插入任务
		const abstractFile = app.vault.getAbstractFileByPath(filePath);
		if (abstractFile instanceof TFile) {
			await insertTaskToFile(app, abstractFile, taskData, settings.newTaskHeading);
			new Notice(i18n.t('dailyNote.createdAndAdded'));
			return filePath;
		}
		return null;
	} catch (error) {
		Logger.error('DailyNoteHelper', 'Error creating daily note:', error);
		new Notice(i18n.t('dailyNote.createFailed', { error: (error as Error).message }));
		return null;
	}
}

/**
 * 使用模板文件创建 Daily Note
 */
async function createDailyNoteFromTemplate(
	app: App,
	filePath: string,
	templatePath: string,
	noteDate: Date
): Promise<void> {
	// 确保文件夹存在
	const folderPath = filePath.split('/').slice(0, -1).join('/');
	if (folderPath) {
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await app.vault.createFolder(folderPath);
		}
	}

	let content = '';

	if (templatePath) {
		const templateFile = app.vault.getAbstractFileByPath(templatePath);
		if (templateFile instanceof TFile) {
			content = await app.vault.read(templateFile);
			content = replaceTemplateVariables(content, filePath, noteDate);
		} else {
			throw new Error(`模板文件未找到: ${templatePath}`);
		}
	}

	await app.vault.create(filePath, content);
}

/**
 * 替换模板变量
 * 支持 {{date}}、{{time}}、{{title}}、{{date:FORMAT}}、{{yesterday}}、{{tomorrow}}
 *
 * 所有日期变量都以「被创建的那一天」为基准，而不是今天——
 * 补建历史日记时模板里的 {{date}}/{{yesterday}} 才不会是错的。
 */
function replaceTemplateVariables(content: string, filePath: string, noteDate: Date): string {
	const moment = window.moment;
	const date = moment(noteDate);
	const filename = filePath.split('/').pop()!.replace(/\.md$/, '');

	// 先处理带格式和偏移的复杂模式 {{date:FORMAT}}、{{date+1d:FORMAT}}
	content = content.replace(
		/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
		(_match: string, _key: string, _calc?: string, delta?: string, unit?: string, fmt?: string) => {
			const current = date.clone();
			if (delta && unit) {
				current.add(parseInt(delta, 10), unit as unknown as 'y' | 'Q' | 'M' | 'w' | 'd' | 'h' | 'm' | 's' | 'ms');
			}
			if (fmt) {
				return current.format(fmt.substring(1).trim());
			}
			return current.format('YYYY-MM-DD');
		}
	);

	content = content.replace(/{{\s*date\s*}}/gi, filename);
	content = content.replace(/{{\s*time\s*}}/gi, moment().format('HH:mm'));
	content = content.replace(/{{\s*title\s*}}/gi, filename);
	content = content.replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, 'day').format('YYYY-MM-DD'));
	content = content.replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, 'day').format('YYYY-MM-DD'));

	return content;
}

/**
 * 在文件中插入任务
 */
async function insertTaskToFile(
	app: App,
	file: TFile,
	taskData: CreateTaskData,
	heading?: string
): Promise<void> {
	const content = await app.vault.read(file);
	const lines = content.split('\n');

	// 序列化任务为文本
	const taskLine = serializeNewTask(taskData, app);
	// 详情行（任务行下方缩进内容）；无详情时为空数组
	const detailLines = formatDetailLines(taskData.details ?? '', '', false);
	const block = [taskLine, ...detailLines];

	if (heading) {
		// 在指定标题下插入
		const headingIndex = findHeadingIndex(lines, heading);
		if (headingIndex !== -1) {
			// 找到标题后的最后一个内容行
			const insertIndex = findLastContentLineIndex(lines, headingIndex);
			lines.splice(insertIndex + 1, 0, ...block);
		} else {
			// 标题不存在，添加到文件末尾并创建标题
			lines.push('', heading.startsWith('#') ? heading : `## ${heading}`, '', ...block);
		}
	} else {
		// 添加到文件末尾
		if (lines[lines.length - 1].trim()) {
			lines.push('');  // 添加空行
		}
		lines.push(...block);
	}

	await app.vault.modify(file, lines.join('\n'));
}

/**
 * 把状态 key 解析成复选框符号。
 *
 * 从插件设置 taskStatuses 里查（含用户自定义状态）；查不到时回退到内置状态表，
 * 再查不到就落回 ' '（未开始），保证写入的始终是合法的合法单字符符号。
 */
function resolveStatusSymbol(
	statusKey: string | undefined,
	settings: Record<string, unknown> | undefined
): string {
	if (!statusKey) return ' ';

	const configured = settings?.taskStatuses;
	const list: TaskStatus[] = Array.isArray(configured) && configured.length > 0
		? (configured as TaskStatus[])
		: ALL_BUILTIN_STATUSES;

	const found = list.find(s => s.key === statusKey) ?? getStatusByKey(statusKey);
	const symbol = found?.symbol;
	// 复选框符号必须是单个非方括号字符，否则整行 markdown 会失效
	if (symbol && symbol.length === 1 && symbol !== '[' && symbol !== ']') {
		return symbol;
	}
	return ' ';
}

/**
 * 序列化新任务为文本行
 */
function serializeNewTask(taskData: CreateTaskData, app: App): string {
	// Access Obsidian internal plugin API (not in public types)
	const plugin = (app as unknown as Record<string, Record<string, Record<string, unknown>>>).plugins.plugins['gantt-calendar'] as Record<string, unknown> | undefined;
	const settings = plugin?.settings as Record<string, unknown> | undefined;
	const globalFilter: string = (settings?.globalTaskFilter as string) || '';
	const enabledFormats: string[] = (settings?.enabledTaskFormats as string[]) || ['tasks'];
	const format = enabledFormats.includes('dataview') ? 'dataview' : 'tasks';

	const parts: string[] = [];

	// 复选框：按状态配置解析符号（[x] [/] [-] [!] / 自定义符号）。
	// 之前硬编码 '[ ]'，导致新建任务永远落在「未开始」，选中的状态被丢弃。
	const statusSymbol = resolveStatusSymbol(taskData.status, settings);
	parts.push(`[${statusSymbol}]`);

	// 全局过滤器
	if (globalFilter) {
		parts.push(globalFilter.trim());
	}

	// 标签
	if (taskData.tags && taskData.tags.length > 0) {
		parts.push(taskData.tags.map(t => `#${t}`).join(' '));
	}

	// 描述
	parts.push(taskData.description);

	// 周期任务
	if (taskData.repeat) {
		if (format === 'tasks') {
			parts.push(`🔁 ${taskData.repeat}`);
		} else {
			parts.push(`[repeat:: ${taskData.repeat}]`);
		}
	}

	// 创建日期
	const createdPrecision = taskData.datePrecision?.['createdDate'];
		const createdStr = formatDate(taskData.createdDate, createdPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
	if (format === 'tasks') {
		parts.push(`➕ ${createdStr}`);
	} else {
		parts.push(`[created:: ${createdStr}]`);
	}

	// 开始日期
	if (taskData.startDate) {
		const startPrecision = taskData.datePrecision?.['startDate'];
		const startStr = formatDate(taskData.startDate, startPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`🛫 ${startStr}`);
		} else {
			parts.push(`[start:: ${startStr}]`);
		}
	}

	// 计划日期
	if (taskData.scheduledDate) {
		const scheduledPrecision = taskData.datePrecision?.['scheduledDate'];
		const scheduledStr = formatDate(taskData.scheduledDate, scheduledPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`⏳ ${scheduledStr}`);
		} else {
			parts.push(`[scheduled:: ${scheduledStr}]`);
		}
	}

	// 截止日期
	const duePrecision = taskData.datePrecision?.['dueDate'];
		const dueStr = formatDate(taskData.dueDate, duePrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
	if (format === 'tasks') {
		parts.push(`📅 ${dueStr}`);
	} else {
		parts.push(`[due:: ${dueStr}]`);
	}

	// 完成日期
	if (taskData.completionDate) {
		const completionPrecision = taskData.datePrecision?.['completionDate'];
		const completionStr = formatDate(taskData.completionDate, completionPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`✅ ${completionStr}`);
		} else {
			parts.push(`[completed:: ${completionStr}]`);
		}
	}

	// 取消日期
	if (taskData.cancelledDate) {
		const cancelledPrecision = taskData.datePrecision?.['cancelledDate'];
		const cancelledStr = formatDate(taskData.cancelledDate, cancelledPrecision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
		if (format === 'tasks') {
			parts.push(`❌ ${cancelledStr}`);
		} else {
			parts.push(`[cancelled:: ${cancelledStr}]`);
		}
	}

	return `- ${parts.join(' ')}`;
}

/**
 * 查找标题行索引
 */
function findHeadingIndex(lines: string[], heading: string): number {
	// 移除 ## 前缀（如果用户输入了）
	const cleanHeading = heading.replace(/^#+\s*/, '').trim();
	const headingRegex = new RegExp(`^#{1,6}\\s+${cleanHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
	return lines.findIndex(line => headingRegex.test(line));
}

/**
 * 查找标题后的最后一个内容行索引
 */
function findLastContentLineIndex(lines: string[], startIdx: number): number {
	let lastContentIdx = startIdx;

	for (let i = startIdx + 1; i < lines.length; i++) {
		const line = lines[i];

		// 遇到同级或更高级标题则停止
		if (/^#{1,2}\s/.test(line)) {
			break;
		}

		// 记录最后一个非空行
		if (line.trim()) {
			lastContentIdx = i;
		}
	}

	return lastContentIdx;
}
