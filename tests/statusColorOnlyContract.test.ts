/**
 * 任务状态纯颜色化契约（2026-11-23 重构）
 *
 * 本次重构把 7 个任务状态从「完成/取消语义 + 颜色」彻底降级为「纯颜色标签」：
 *  1. 剔除复选框功能（卡片 UI + 甘特图），不再有「勾选完成」这个动作
 *  2. 状态只决定卡片底色，不再映射 completed / cancelled
 *  3. 移除 ✅ 完成日期 / ❌ 取消日期两个日期字段
 *  4. 移除同步子系统（飞书 / CalDAV / API）与状态栏
 *  5. 7 个状态完全平等：都可编辑、可删除（isDefault 全为 false）
 *
 * 本测试锁定这些契约，防止旧语义回流。
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
	ALL_BUILTIN_STATUSES,
	DEFAULT_TASK_STATUSES,
	PRESET_CUSTOM_STATUSES,
	parseStatusFromCheckbox,
} from '../src/tasks/taskStatus';
import { parseCheckboxStatus } from '../src/tasks/taskParser/step4';

const SRC = join(__dirname, '..', 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

describe('状态只做颜色：7 个状态全部平等', () => {
	test('内置状态共 5 个（待办/已完成已移除），且无 isDefault 保护', () => {
		expect(ALL_BUILTIN_STATUSES).toHaveLength(5);
		for (const s of ALL_BUILTIN_STATUSES) {
			expect(s.isDefault).toBe(false);
		}
	});

	test('DEFAULT 与 PRESET 都不再有不可删除项', () => {
		expect(DEFAULT_TASK_STATUSES.every((s) => s.isDefault === false)).toBe(true);
		expect(PRESET_CUSTOM_STATUSES.every((s) => s.isDefault === false)).toBe(true);
	});

	test('5 个符号映射保持稳定', () => {
		const map: Record<string, string> = {
			'!': 'important', '-': 'canceled',
			'/': 'in_progress', '?': 'question', n: 'start',
		};
		for (const s of ALL_BUILTIN_STATUSES) {
			expect(map[s.symbol]).toBe(s.key);
			expect(parseStatusFromCheckbox(s.symbol)).toBe(s.key);
		}
	});
});

describe('复选框解析不再产出完成/取消语义', () => {
	test('[x] 已无映射，返回空串，且没有 completed 字段', () => {
		const r = parseCheckboxStatus('x');
		const e = '';
		expect(r.status).toBe(e);
		expect('completed' in r).toBe(false);
		expect('cancelled' in r).toBe(false);
	});

	test('[-] 只映射到 canceled 状态 key，没有 cancelled 字段', () => {
		const r = parseCheckboxStatus('-');
		expect(r.status).toBe('canceled');
		expect('cancelled' in r).toBe(false);
	});

	test('未知符号返回空串（不再有完成态归一化）', () => {
		expect(parseCheckboxStatus('z').status).toBe('');
		expect(parseCheckboxStatus('X').status).toBe('');
	});
});

describe('源码契约：完成/取消语义与同步子系统已移除', () => {
	test('GCTask 不再声明 completed / cancelled / completionDate / cancelledDate', () => {
		const t = read('types.ts');
		const iface = t.slice(t.indexOf('export interface GCTask'), t.indexOf('export type SortField'));
		expect(iface).not.toMatch(/^\s*completed:/m);
		expect(iface).not.toMatch(/^\s*cancelled\??:/m);
		expect(iface).not.toMatch(/^\s*completionDate\??:/m);
		expect(iface).not.toMatch(/^\s*cancelledDate\??:/m);
	});

	test('DateFieldType 只剩 4 个日期字段', () => {
		const t = read('settings', 'types.ts');
		expect(t).toMatch(
			/export type DateFieldType = 'createdDate' \| 'startDate' \| 'scheduledDate' \| 'dueDate';/,
		);
	});

	test('任务卡片不再渲染复选框', () => {
		const card = read('ui', 'components', 'TaskCard.tsx');
		expect(card).not.toMatch(/type="checkbox"/);
		expect(card).not.toMatch(/handleCheckboxChange/);
		expect(card).not.toMatch(/showCheckbox/);
	});

	test('TaskCardConfig 不再有 showCheckbox 字段', () => {
		const cfg = read('components', 'TaskCard', 'TaskCardConfig.ts');
		expect(cfg).not.toMatch(/showCheckbox/);
	});

	test('甘特图不再有复选框与进度条', () => {
		const g = read('gantt', 'wrappers', 'svgGanttRenderer.ts');
		expect(g).not.toMatch(/createTaskCheckbox/);
		expect(g).not.toMatch(/task\.progress/);
		expect(g).not.toMatch(/task\.completed/);
	});

	test('taskUpdater 不再导出 updateTaskCompletion', () => {
		const u = read('tasks', 'taskUpdater.ts');
		expect(u).not.toMatch(/export async function updateTaskCompletion/);
	});

	test('taskSerializer 写回时不再有完成/取消分支', () => {
		const s = read('tasks', 'taskSerializer.ts');
		expect(s).not.toMatch(/merged\.completed/);
		expect(s).not.toMatch(/merged\.cancelled/);
		expect(s).not.toMatch(/completionDate/);
		expect(s).not.toMatch(/cancelledDate/);
	});

	test('正则符号表不再包含 ✅ / ❌', () => {
		const r = read('utils', 'RegularExpressions.ts');
		expect(r).not.toMatch(/completion: '✅'/);
		expect(r).not.toMatch(/cancelled: '❌'/);
	});

	test('完成态 CSS（删除线 / 透明度）已移除', () => {
		const theme = read('styles', 'theme.css');
		expect(theme).not.toMatch(/task-card--completed/);
		expect(theme).not.toMatch(/text-decoration: line-through/);
	});

	test('同步子系统目录已删除', () => {
		const { existsSync } = require('fs') as typeof import('fs');
		expect(existsSync(join(SRC, 'data-layer', 'feishu-sync'))).toBe(false);
		expect(existsSync(join(SRC, 'data-layer', 'sync'))).toBe(false);
		expect(existsSync(join(SRC, 'data-layer', 'sources'))).toBe(false);
		expect(existsSync(join(SRC, 'statusBar'))).toBe(false);
		expect(existsSync(join(SRC, 'managers', 'SyncManagerBridge.ts'))).toBe(false);
	});

	test('设置面板不再有「同步」Tab', () => {
		const tab = read('settings', 'SettingTab.ts');
		expect(tab).not.toMatch(/SyncSettingsBuilder/);
		expect(tab).not.toMatch(/renderSyncTab/);
	});
});
