/**
 * 优先级功能整体移除契约（2026-11-25）
 *
 * 用户要求把「优先级」从插件里彻底删除剥离，不只是隐藏编辑面板那一块。
 * 本测试锁定以下契约，防止优先级以任何形式回流：
 *  1. GCTask 不再有 priority 字段；SortField 不再含 'priority'
 *  2. 解析层不再产出 priority（step4 无 parseTasksPriority / parseDataviewPriority）
 *  3. 序列化不再写回优先级 emoji / [priority:: ...]
 *  4. 排序器无 priority 比较器；SORT_OPTIONS 无 priority
 *  5. 编辑面板无优先级板块；卡片无优先级徽标；右键菜单无优先级段
 *  6. 设置项 defaultTaskPriority / *ShowPriority 已移除
 *  7. 甘特图不再按优先级着色；tooltip 不再显示优先级
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SORT_OPTIONS, sortTasks } from '../src/tasks/taskSorter';
import { parseTasksAttributes, parseDataviewAttributes } from '../src/tasks/taskParser/step4';
import * as step4Module from '../src/tasks/taskParser/step4';
import * as symbolsModule from '../src/tasks/taskSerializerSymbols';
import type { GCTask, SortField } from '../src/types';

const SRC = join(__dirname, '..', 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

describe('优先级：类型与解析层已移除', () => {
	test('GCTask 不再声明 priority 字段', () => {
		const t = read('types.ts');
		const iface = t.slice(t.indexOf('export interface GCTask'), t.indexOf('export type SortField'));
		expect(iface).not.toMatch(/^\s*priority:/m);
	});

	test("SortField 不再包含 'priority'", () => {
		const t = read('types.ts');
		const sortField = t.slice(t.indexOf('export type SortField'), t.indexOf('export type SortOrder'));
		expect(sortField).not.toContain("'priority'");
	});

	test('解析结果不含 priority 字段', () => {
		const tasksAttrs = parseTasksAttributes('任务 ⏫ ➕ 2024-01-10 📅 2024-01-15');
		expect('priority' in tasksAttrs).toBe(false);
		const dvAttrs = parseDataviewAttributes('任务 [priority:: high] [due:: 2024-01-15]');
		expect('priority' in dvAttrs).toBe(false);
	});

	test('step4 不再导出优先级解析函数', () => {
		const mod = step4Module as unknown as Record<string, unknown>;
		expect(mod.parseTasksPriority).toBeUndefined();
		expect(mod.parseDataviewPriority).toBeUndefined();
	});

	test('taskSerializerSymbols 不再导出优先级工具函数', () => {
		const mod = symbolsModule as unknown as Record<string, unknown>;
		expect(mod.parsePriorityFromEmoji).toBeUndefined();
		expect(mod.parsePriorityFromDataview).toBeUndefined();
		expect(mod.priorityLevelToEmoji).toBeUndefined();
		expect(mod.priorityLevelToDataview).toBeUndefined();
	});

	test('RegularExpressions 不再有 priority 符号/正则', () => {
		const r = read('utils', 'RegularExpressions.ts');
		expect(r).not.toMatch(/prioritySymbols/);
		expect(r).not.toMatch(/priorityRegex/);
		expect(r).not.toMatch(/priorityValues/);
	});
});

describe('优先级：序列化与排序已移除', () => {
	test('taskSerializer 不写回优先级 emoji / [priority::]', () => {
		const s = read('tasks', 'taskSerializer.ts');
		expect(s).not.toMatch(/getPriorityEmoji/);
		expect(s).not.toMatch(/\[priority::/);
		expect(s).not.toMatch(/merged\.priority/);
	});

	test('TaskUpdates 不再有 priority 字段', () => {
		const s = read('tasks', 'taskSerializer.ts');
		const iface = s.slice(s.indexOf('export interface TaskUpdates'), s.indexOf('interface MergedTask'));
		expect(iface).not.toMatch(/^\s*priority\?:/m);
	});

	test('排序器无 priority 比较器，SORT_OPTIONS 无 priority', () => {
		const s = read('tasks', 'taskSorter.ts');
		expect(s).not.toMatch(/PRIORITY_WEIGHTS/);
		expect(s).not.toMatch(/^\s*priority:/m);
		const fields = SORT_OPTIONS.map((o) => o.field);
		expect(fields).not.toContain('priority');
		expect(fields).toHaveLength(5);
	});

	test("传入 field: 'priority' 时不排序（原样返回）", () => {
		const tasks = [
			{ description: 'a', filePath: 'a.md', fileName: 'a', lineNumber: 1, content: '', status: 'important' },
			{ description: 'b', filePath: 'b.md', fileName: 'b', lineNumber: 1, content: '', status: 'important' },
		] as unknown as GCTask[];
		// 'priority' 已不是合法 SortField，此处刻意越界传入以验证比较器缺失时原样返回
		const result = sortTasks(tasks, { field: 'priority' as SortField, order: 'asc' });
		expect(result).toBe(tasks);
	});
});

describe('优先级：UI 与设置已移除', () => {
	test('编辑面板不再有优先级板块', () => {
		const m = read('ui', 'modals', 'TaskFormModal.tsx');
		expect(m).not.toMatch(/priorityOptions/);
		expect(m).not.toMatch(/priorityLabel/);
		expect(m).not.toMatch(/priorityGrid/);
		expect(m).not.toMatch(/setPriority/);
	});

	test('任务卡片不再渲染优先级徽标', () => {
		const c = read('ui', 'components', 'TaskCard.tsx');
		expect(c).not.toMatch(/PRIORITY_ICONS/);
		expect(c).not.toMatch(/PRIORITY_CLASSES/);
		expect(c).not.toMatch(/elements\.priority/);
	});

	test('右键菜单不再有优先级段，setPriority 命令文件已删除', () => {
		const c = read('ui', 'components', 'TaskCard.tsx');
		expect(c).not.toMatch(/setTaskPriority/);
		expect(existsSync(join(SRC, 'contextMenu', 'commands', 'setPriority.ts'))).toBe(false);
	});

	test('设置项 defaultTaskPriority / *ShowPriority 已移除', () => {
		const types = read('settings', 'types.ts');
		const constants = read('settings', 'constants.ts');
		expect(types).not.toMatch(/defaultTaskPriority/);
		expect(types).not.toMatch(/ShowPriority/);
		expect(constants).not.toMatch(/defaultTaskPriority/);
		expect(constants).not.toMatch(/ShowPriority/);
	});

	test('TaskCardConfig 不再有 showPriority', () => {
		const cfg = read('components', 'TaskCard', 'TaskCardConfig.ts');
		expect(cfg).not.toMatch(/showPriority/);
	});

	test('设置面板不再有优先级显示控制 chip', () => {
		const b = read('settings', 'builders', 'CardDisplaySettingsBuilder.ts');
		expect(b).not.toMatch(/ShowPriority/);
	});

	test('甘特图不再按优先级着色', () => {
		const g = read('gantt', 'wrappers', 'svgGanttRenderer.ts');
		expect(g).not.toMatch(/priority-highest/);
		expect(g).not.toMatch(/priority-high/);
		expect(g).not.toMatch(/priority-medium/);
		expect(g).not.toMatch(/priority-low/);
	});

	test('tooltip 不再显示优先级行', () => {
		const t = read('components', 'tooltip', 'tooltipSections.ts');
		expect(t).not.toMatch(/task\.priority/);
		expect(t).not.toMatch(/PRIORITY_ICONS/);
	});

	test('侧栏任务列表不再有优先级筛选/排序', () => {
		const p = read('ui', 'sidebar', 'TaskListPanel.tsx');
		expect(p).not.toMatch(/priorityFilter/);
		expect(p).not.toMatch(/getPriorities/);
	});

	test('工具栏排序菜单不再有优先级项', () => {
		const t = read('ui', 'components', 'Toolbar.tsx');
		expect(t).not.toMatch(/'priority'/);
	});

	test('新建任务不再写入优先级', () => {
		const d = read('utils', 'dailyNoteHelper.ts');
		expect(d).not.toMatch(/getPriorityEmoji/);
		expect(d).not.toMatch(/taskData\.priority/);
		expect(d).not.toMatch(/\[priority::/);
	});
});
