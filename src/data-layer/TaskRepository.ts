/**
 * TaskRepository - 任务仓库
 *
 * 任务仓库是数据层的核心组件，负责：
 * - 管理数据源
 * - 维护任务缓存
 * - 提供高性能查询接口
 * - 处理数据源变化事件
 *
 * 设计模式：仓库模式（Repository Pattern）
 * 直接使用 GCTask 作为内部格式，避免无意义的转换。
 */

import { EventBus } from './EventBus';
import type { GCTask } from '../types';
import {
	DataSourceChanges,
	QueryOptions
} from './types';
import { IDataSource } from './IDataSource';
import { Logger } from '../utils/logger';

/**
 * 生成任务ID
 */
function generateTaskId(task: GCTask): string {
	return `${task.filePath}:${task.lineNumber}`;
}

export class TaskRepository {
	private dataSources: Map<string, IDataSource> = new Map();
	private taskCache: Map<string, GCTask> = new Map();
	private fileIndex: Map<string, Set<string>> = new Map();
	private eventBus: EventBus;

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/**
	 * 注册数据源
	 * @param source - 数据源实例
	 */
	registerDataSource(source: IDataSource): void {
		this.dataSources.set(source.sourceId, source);
		source.onChange(async (changes, opts) => {
			await this.handleSourceChanges(source.sourceId, changes, opts);
		});
	}

	/**
	 * 获取所有任务
	 * @param options - 查询选项
	 * @returns 任务列表
	 */
	getAllTasks(options?: QueryOptions): GCTask[] {
		// 按任务「真实身份」（filePath:lineNumber）去重。
		// 背景：行号漂移重配时曾以历史缓存键作为仓库键，导致同一任务
		// 以多个键并存（各键的值指向同一行）。若不去重，视图会把同一条任务
		// 渲染成多个重叠块（日/周视图表现为并排重复卡）。一行只会对应一条任务，
		// 因此按值的 filePath:lineNumber 归并是安全的；同身份优先保留「键=身份」的规范条目。
		const byIdentity = new Map<string, GCTask>();
		for (const [key, task] of this.taskCache) {
			const identity = generateTaskId(task);
			if (!byIdentity.has(identity) || key === identity) {
				byIdentity.set(identity, task);
			}
		}
		const tasks = Array.from(byIdentity.values());
		return this.filterTasks(tasks, options);
	}

	/**
	 * 根据日期范围获取任务
	 * @param start - 开始日期
	 * @param end - 结束日期
	 * @param dateField - 日期字段名
	 * @returns 任务列表
	 */
	getTasksByDateRange(
		start: Date,
		end: Date,
		dateField: keyof GCTask = 'dueDate'
	): GCTask[] {
		return Array.from(this.taskCache.values()).filter(task => {
			const date = task[dateField] as Date | undefined;
			return date && date >= start && date <= end;
		});
	}

	/**
	 * 根据文件路径获取任务
	 * @param filePath - 文件路径
	 * @returns 任务列表
	 */
	getTasksByFilePath(filePath: string): GCTask[] {
		const taskIds = this.fileIndex.get(filePath) || new Set();
		return Array.from(taskIds)
			.map(id => this.taskCache.get(id)!)
			.filter(Boolean);
	}

	/**
	 * 获取任务统计信息
	 * @returns 统计信息
	 */
	getStats(): {
		totalTasks: number;
		dataSources: number;
		totalFiles: number;
	} {
		return {
			totalTasks: this.taskCache.size,
			dataSources: this.dataSources.size,
			totalFiles: this.fileIndex.size
		};
	}

	/**
	 * 过滤任务
	 * @param tasks - 任务列表
	 * @param options - 查询选项
	 * @returns 过滤后的任务列表
	 */
	private filterTasks(tasks: GCTask[], options?: QueryOptions): GCTask[] {
		if (!options) return tasks;

		let filtered = tasks;

		if (options.status?.length) {
			filtered = filtered.filter(t => options.status!.includes(t.status as string));
		}

		if (options.tags?.length) {
			filtered = filtered.filter(t =>
				options.tags!.some(tag => t.tags?.includes(tag))
			);
		}

		if (options.dateRange) {
			const fieldMap: Record<keyof import('./types').TaskDates, keyof GCTask> = {
				created: 'createdDate',
				start: 'startDate',
				scheduled: 'scheduledDate',
				due: 'dueDate',
			};
			const gcField = fieldMap[options.dateRange.field];

			filtered = filtered.filter(t => {
				const date = t[gcField] as Date | undefined;
				return date && date >= options.dateRange!.start && date <= options.dateRange!.end;
			});
		}

		if (options.sources?.length) {
			filtered = filtered.filter(t => options.sources!.includes(t.filePath));
		}

		return filtered;
	}

	/**
	 * 将任务 ID 加入文件索引
	 */
	private indexAdd(filePath: string | undefined, taskId: string): void {
		if (!filePath) return;
		if (!this.fileIndex.has(filePath)) {
			this.fileIndex.set(filePath, new Set());
		}
		this.fileIndex.get(filePath)!.add(taskId);
	}

	/**
	 * 从文件索引移除任务 ID（集合清空时删除该文件索引）
	 */
	private indexRemove(filePath: string | undefined, taskId: string): void {
		if (!filePath) return;
		const taskIds = this.fileIndex.get(filePath);
		if (!taskIds) return;
		taskIds.delete(taskId);
		if (taskIds.size === 0) {
			this.fileIndex.delete(filePath);
		}
	}

	/**
	 * 处理数据源变化
	 * @param sourceId - 数据源ID
	 * @param changes - 变化详情
	 */
	private async handleSourceChanges(
		sourceId: string,
		changes: DataSourceChanges,
		opts?: { initial?: boolean }
	): Promise<void> {
		const isInitialLoad = opts?.initial === true;
		const startTime = performance.now();
		Logger.debug('TaskRepository', `Processing changes from ${sourceId}:`, {
			created: changes.created.length,
			updated: changes.updated.length,
			deleted: changes.deleted.length,
			deletedFilePaths: changes.deletedFilePaths?.length || 0
		});

		// 处理新增任务
		for (const task of changes.created) {
			const taskId = generateTaskId(task);
			this.taskCache.set(taskId, task);

			// 更新文件索引
			this.indexAdd(task.filePath, taskId);

			// 首扫只维护缓存，等批量加载完成后统一通知，避免大库产生任务数级别的定时器 churn
			if (!isInitialLoad) {
				this.eventBus.emit('task:created', { task });
			}
		}

		// 处理更新任务
		for (const { id, changes: taskChanges, task: newTask } of changes.updated) {
			let updatedTask: GCTask | undefined;

			// 优先使用完整的新任务对象（如果提供）
			if (newTask) {
				updatedTask = newTask;
				// 规范键归一：数据源在「行号漂移重配」时会用历史缓存键 id 回传更新，
				// 而新任务的真实身份是 generateTaskId(newTask)。若两者不一致，直接把条目
				// 迁移到规范键（删除旧键 + 写入规范键），避免同一任务在仓库里以多个键累积
				// （否则每次行号漂移就新增一条，视图出现重复块）。
				const canonicalId = generateTaskId(newTask);
				if (canonicalId !== id) {
					const oldFilePath = id.slice(0, id.lastIndexOf(':'));
					this.taskCache.delete(id);
					this.indexRemove(oldFilePath, id);
					this.taskCache.set(canonicalId, newTask);
					this.indexAdd(newTask.filePath, canonicalId);
				} else {
					this.taskCache.set(id, newTask);
				}
			} else {
				// 否则使用增量更新
				const task = this.taskCache.get(id);
				if (task) {
					updatedTask = { ...task, ...taskChanges };
					this.taskCache.set(id, updatedTask);
				}
			}

			if (updatedTask) {
				// 发布事件
				this.eventBus.emit('task:updated', { task: updatedTask });
			}
		}

		// 处理删除任务
		for (const task of changes.deleted) {
			const taskId = generateTaskId(task);
			this.taskCache.delete(taskId);
			this.indexRemove(task.filePath, taskId);

			// 发布事件
			this.eventBus.emit('task:deleted', { taskId });
		}

		// 处理文件删除（按文件路径清理所有任务）
		if (changes.deletedFilePaths) {
			for (const filePath of changes.deletedFilePaths) {
				const taskIds = this.fileIndex.get(filePath);
				if (taskIds) {
					// 删除该文件的所有任务
					for (const taskId of taskIds) {
						this.taskCache.delete(taskId);
						this.eventBus.emit('task:deleted', { taskId });
					}
					// 清理文件索引
					this.fileIndex.delete(filePath);
				}
			}
		}

		if (isInitialLoad) {
			this.eventBus.emit('tasks:loaded', {
				sourceId,
				totalTasks: this.taskCache.size,
			});
		}

		const elapsed = performance.now() - startTime;
		Logger.debug('TaskRepository', `Changes processed in ${elapsed.toFixed(2)}ms`);
	}

	/**
	 * 清空缓存
	 * 【注意】不清空 eventBus，因为 eventBus 的所有权属于 TaskStore
	 */
	clear(): void {
		this.taskCache.clear();
		this.fileIndex.clear();
		// 【修复】不清空 eventBus，因为它是 TaskStore 的实例，TaskStore 的监听器会受影响
		// this.eventBus.clear();
	}
}
