/**
 * 任务格式符号映射配置
 *
 * 作为中间层，将 GCTask 属性映射到 Tasks 或 Dataview 格式的具体字段和正则匹配项。
 * 提供 formatDetection、parseDates 等解析功能的统一接口。
 *
 * @fileoverview 任务格式符号映射和正则表达式配置
 * @module tasks/taskSerializerSymbols
 */

import { RegularExpressions } from '../utils/RegularExpressions';

// ==================== 类型定义 ====================

/**
 * 任务格式类型
 * 'tasks' - Obsidian Tasks 插件的 emoji 格式
 * 'dataview' - Dataview 插件的 inline field 格式
 */
export type TaskFormatType = 'tasks' | 'dataview';

/**
 * 日期字段类型
 * 对应 GCTask 中的日期属性
 *
 * 统一复用 settings/types 的定义（此前各处各自声明，删字段后类型漂移）
 */
import type { DateFieldType } from '../settings/types';
export type { DateFieldType };

// ==================== 接口定义 ====================

/**
 * 符号映射接口
 * 定义 GCTask 属性到具体格式符号的映射关系
 */
export interface TaskSymbolMapping {
    /** 日期字段符号映射 */
    dates: Readonly<Record<DateFieldType, string>>;

    /** 周期任务符号映射 */
    repeat?: string;
}

/**
 * 正则表达式映射接口
 * 定义各字段对应的匹配正则表达式
 */
export interface TaskRegexMapping {
    /** 日期字段正则映射 */
    dates: Readonly<Record<DateFieldType, RegExp>>;

    /** 周期任务匹配正则 */
    repeat?: RegExp;

    /** 格式检测正则（快速判断是否包含该格式的标记） */
    formatDetection: RegExp;
}

/**
 * 任务格式配置接口
 * 完整定义一种任务格式的符号和正则配置
 */
export interface TaskFormatConfig {
    /** 格式类型标识 */
    readonly type: TaskFormatType;

    /** 格式名称（用于显示） */
    readonly name: string;

    /** 符号映射 */
    readonly symbols: TaskSymbolMapping;

    /** 正则表达式映射 */
    readonly regex: TaskRegexMapping;
}

// ==================== Tasks 格式配置 ====================

/**
 * Tasks 格式配置
 * 基于 Obsidian Tasks 插件的 emoji 格式
 *
 * @example
 * - [ ] 任务 ⏫ ➕ 2024-01-10 📅 2024-01-15
 */
export const TASKS_FORMAT_CONFIG: TaskFormatConfig = {
    type: 'tasks',
    name: 'Tasks (Emoji)',

    symbols: {
        dates: {
            createdDate: RegularExpressions.Tasks.dateSymbols.created,
            startDate: RegularExpressions.Tasks.dateSymbols.start,
            scheduledDate: RegularExpressions.Tasks.dateSymbols.scheduled,
            dueDate: RegularExpressions.Tasks.dateSymbols.due,
        },
        repeat: RegularExpressions.Tasks.repeatSymbols.repeat,
    },

    regex: {
        dates: {
            createdDate: RegularExpressions.Tasks.createdDateRegex,
            startDate: RegularExpressions.Tasks.startDateRegex,
            scheduledDate: RegularExpressions.Tasks.scheduledDateRegex,
            dueDate: RegularExpressions.Tasks.dueDateRegex,
        },
        repeat: RegularExpressions.Tasks.repeatRegex,
        formatDetection: RegularExpressions.Tasks.formatDetectionRegex,
    },
} as const;

// ==================== Dataview 格式配置 ====================

/**
 * Dataview 格式配置
 * 基于 Dataview 插件的 inline field 格式
 *
 * @example
 * - [ ] 任务 [created:: 2024-01-10] [due:: 2024-01-15]
 */
export const DATAVIEW_FORMAT_CONFIG: TaskFormatConfig = {
    type: 'dataview',
    name: 'Dataview (Fields)',

    symbols: {
        dates: {
            createdDate: '[created::',
            startDate: '[start::',
            scheduledDate: '[scheduled::',
            dueDate: '[due::',
        },
        repeat: '[repeat::',
    },

    regex: {
        dates: {
            createdDate: RegularExpressions.Dataview.createdDateRegex,
            startDate: RegularExpressions.Dataview.startDateRegex,
            scheduledDate: RegularExpressions.Dataview.scheduledDateRegex,
            dueDate: RegularExpressions.Dataview.dueDateRegex,
        },
        repeat: RegularExpressions.Dataview.repeatRegex,
        formatDetection: RegularExpressions.Dataview.formatDetectionRegex,
    },
} as const;

// ==================== 格式注册表 ====================

/**
 * 格式配置注册表
 * 提供按类型访问格式配置的统一入口
 */
export const FORMAT_CONFIGS: Readonly<Record<TaskFormatType, TaskFormatConfig>> = {
    tasks: TASKS_FORMAT_CONFIG,
    dataview: DATAVIEW_FORMAT_CONFIG,
} as const;

// ==================== 工具函数 ====================

/**
 * 获取指定格式的配置
 *
 * @param format - 格式类型
 * @returns 对应的格式配置对象
 *
 * @example
 * ```ts
 * const tasksConfig = getFormatConfig('tasks');
 * console.log(tasksConfig.symbols.dates.dueDate); // "📅"
 * ```
 */
export function getFormatConfig(format: TaskFormatType): TaskFormatConfig {
    return FORMAT_CONFIGS[format];
}

/**
 * 检测任务内容使用的格式
 *
 * 根据内容中的特征判断使用的是 Tasks 格式、Dataview 格式，还是两者混用。
 *
 * @param content - 任务内容（复选框后的部分）
 * @param enabledFormats - 启用的格式列表
 * @returns 检测到的格式类型，'mixed' 表示混用，undefined 表示无法检测
 *
 * @example
 * ```ts
 * detectTaskFormat("任务 ⏫ 📅 2024-01-15", ['tasks', 'dataview'])
 * // 返回: 'tasks'
 *
 * detectTaskFormat("任务 [due:: 2024-01-15]", ['tasks', 'dataview'])
 * // 返回: 'dataview'
 *
 * detectTaskFormat("任务 ⏫ [due:: 2024-01-15]", ['tasks', 'dataview'])
 * // 返回: 'mixed'
 * ```
 */
export function detectTaskFormat(
    content: string,
    enabledFormats: TaskFormatType[]
): TaskFormatType | 'mixed' | undefined {
    const hasTasks =
        enabledFormats.includes('tasks') &&
        TASKS_FORMAT_CONFIG.regex.formatDetection.test(content);

    const hasDataview =
        enabledFormats.includes('dataview') &&
        DATAVIEW_FORMAT_CONFIG.regex.formatDetection.test(content);

    // 两种格式都存在时，视为混合格式
    if (hasTasks && hasDataview) {
        return 'mixed';
    }

    if (hasTasks) return 'tasks';
    if (hasDataview) return 'dataview';

    return undefined;
}
