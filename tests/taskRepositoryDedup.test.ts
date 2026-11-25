/**
 * TaskRepository 重复任务回归（2026-11-24）
 *
 * 现象：日视图/侧栏单日时间线里，同一条任务被渲染成多个并排的重叠块。
 * 根因：行号漂移「重配」时数据源用历史缓存键 id 回传 updated，而任务的真实
 * 身份是 filePath:lineNumber；两者长期不一致会让同一任务在仓库里以多个键累积。
 *
 * 本测试锁定：
 *  - 更新时把条目归一到规范键（旧键删除，不累积）
 *  - 即使仓库里已存在多键同值，getAllTasks 也按身份去重
 *  - 单任务多次漂移更新后始终只剩 1 条
 */

import { TaskRepository } from '../src/data-layer/TaskRepository';
import { EventBus } from '../src/data-layer/EventBus';
import type { IDataSource } from '../src/data-layer/IDataSource';
import type { DataSourceChanges } from '../src/data-layer/types';
import type { GCTask } from '../src/types';

type Handler = (changes: DataSourceChanges) => void | Promise<void>;

class ControllableSource implements IDataSource {
	readonly sourceId = 'mock';
	readonly sourceName = 'Mock';
	readonly isReadOnly = false;
	private handler?: Handler;

	async initialize(): Promise<void> {}
	async getTasks(): Promise<GCTask[]> { return []; }
	onChange(handler: Handler): void { this.handler = handler; }
	async createTask(): Promise<string> { return ''; }
	async updateTask(): Promise<void> {}
	async deleteTask(): Promise<void> {}
	async getSyncStatus() {
		return { syncDirection: 'import-only' as const, conflictResolution: 'local-win' as const };
	}
	destroy(): void { this.handler = undefined; }

	emit(changes: Partial<DataSourceChanges>): Promise<void> | void {
		const full: DataSourceChanges = {
			sourceId: this.sourceId,
			created: [],
			updated: [],
			deleted: [],
			...changes,
		};
		return this.handler?.(full);
	}
}

function mkTask(lineNumber: number): GCTask {
	return {
		filePath: 'Daily Note/2026-11-24.md',
		fileName: '2026-11-24',
		lineNumber,
		content: '🎯 流量不够用 🛫 2026-11-24 21:00 📅 2026-11-24 22:00',
		description: '流量不够用',
		status: 'important',
		startDate: new Date(2026, 10, 24, 21, 0),
		dueDate: new Date(2026, 10, 24, 22, 0),
	};
}

describe('TaskRepository 重复任务去重', () => {
	let repository: TaskRepository;
	let source: ControllableSource;

	beforeEach(() => {
		repository = new TaskRepository(new EventBus());
		source = new ControllableSource();
		repository.registerDataSource(source);
	});

	afterEach(() => repository.clear());

	test('行号漂移更新：以历史键回传时归一到规范键，不累积', async () => {
		await source.emit({ created: [mkTask(1)] });
		expect(repository.getAllTasks()).toHaveLength(1);

		// 模拟数据源用历史缓存键 'f:2' 回传，但任务真实身份是第 1 行
		await source.emit({
			updated: [{ id: 'Daily Note/2026-11-24.md:2', changes: {}, task: mkTask(1) }],
		});

		const tasks = repository.getAllTasks();
		expect(tasks).toHaveLength(1);
		expect(`${tasks[0].filePath}:${tasks[0].lineNumber}`).toBe('Daily Note/2026-11-24.md:1');
		// 仓库内部也不应残留两个键
		expect(repository.getStats().totalTasks).toBe(1);
	});

	test('多次来回漂移：始终只剩 1 条（复现原重复 bug）', async () => {
		await source.emit({ created: [mkTask(1)] });
		// 三次不同历史键的「更新」，指向同一真实任务
		for (const staleKey of [':3', ':2', ':5']) {
			await source.emit({
				updated: [{ id: `Daily Note/2026-11-24.md${staleKey}`, changes: {}, task: mkTask(1) }],
			});
		}
		expect(repository.getAllTasks()).toHaveLength(1);
		expect(repository.getStats().totalTasks).toBe(1);
	});

	test('即便仓库内已存在多键同值，getAllTasks 也按身份去重', async () => {
		// 直接构造「两键同值」的脏状态：先建立 f:1，再用不同 id 但相同真实身份写入
		await source.emit({ created: [mkTask(1)] });
		await source.emit({
			updated: [{ id: 'Daily Note/2026-11-24.md:7', changes: {}, task: mkTask(1) }],
		});
		const tasks = repository.getAllTasks();
		const ids = tasks.map((t) => `${t.filePath}:${t.lineNumber}`);
		expect(new Set(ids).size).toBe(ids.length);
		expect(tasks).toHaveLength(1);
	});
});
