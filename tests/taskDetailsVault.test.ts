/**
 * 详情端到端：用真实 vault 文件验证解析结果（2026-11-25）
 *
 * 直接读取 USER_Candy 的 2026-11-23.md，断言：
 *  - 「三十三-小群」任务解析出 7 行详情（无缩进续行 + Tab 子行）
 *  - 「obsidian 插件」任务解析出 1 行详情
 *  - 「fork gannt calendar」任务无详情
 *  - 详情文本已剥离缩进、保留内容
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseTasksFromListItems } from '../src/tasks/taskParser/main';
import { parseTaskLine } from '../src/tasks/taskParser/step1';
import type { ListItemCache } from 'obsidian';

const VAULT = join('C:', 'Users', 'cake', 'Documents', '000 Obsidian', 'USER_Candy');
const NOTE = join(VAULT, 'Daily Note', '2026-11-23.md');

const hasFixture = existsSync(NOTE);

(hasFixture ? describe : describe.skip)('真实笔记：任务详情解析', () => {
	const content = hasFixture ? readFileSync(NOTE, 'utf8') : '';
	const lines = content.split('\n');

	/** 构造与 MarkdownDataSource.parseFileFromContent 一致的合成 listItems（无 position.end） */
	const listItems: ListItemCache[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (parseTaskLine(lines[i])) {
			listItems.push({
				position: { start: { line: i, col: 0, offset: 0 }, end: { line: i, col: lines[i].length, offset: 0 } },
			} as ListItemCache);
		}
	}

	const tasks = parseTasksFromListItems(
		{ path: 'Daily Note/2026-11-23.md', basename: '2026-11-23' },
		lines,
		listItems,
		['tasks'],
		'🎯 ',
	);

	test('解析出 4 条任务', () => {
		expect(tasks).toHaveLength(4);
	});

	test('「三十三-小群」任务：详情含全部 8 行，且 Tab 层级 1:1 保留', () => {
		const t = tasks.find((x) => x.description.includes('三十三-小群'));
		expect(t).toBeDefined();
		expect(t!.details).toBeDefined();
		const detailLines = t!.details!.split('\n');
		// 文件第 10~17 行：1 行无缩进续行 + 7 行 Tab 子行
		expect(detailLines).toHaveLength(8);
		// 首行原文顶格 → 保持顶格
		expect(detailLines[0]).toBe('==拿到了 1116 版本的包以及补丁==');
		// 后续行原文 1 个 Tab → 保持 1 个 Tab（1:1 忠实原文，不剥缩进）
		expect(detailLines[1].startsWith('\t')).toBe(true);
		expect(detailLines[1]).toBe('\t==「qq.zip」，复制整段内容，打开最新版「夸克APP」即可获取。==');
		expect(detailLines[7]).toContain('pan.quark.cn/s/2be4c52930b7');
		// 高亮 == 语法原样保留
		for (const l of detailLines) {
			expect(l).toContain('==');
		}
	});

	test('「obsidian 插件」任务：详情只有 1 行', () => {
		const t = tasks.find((x) => x.description.includes('obsidian 插件'));
		expect(t).toBeDefined();
		expect(t!.details).toBe('==gantt calendar 插件==');
	});

	test('「fork gannt calendar」任务：无详情', () => {
		const t = tasks.find((x) => x.description.includes('fork gannt calendar'));
		expect(t).toBeDefined();
		expect(t!.details).toBeUndefined();
	});

	test('详情不会串到下一个任务（任务标题不含详情文字）', () => {
		const t = tasks.find((x) => x.description.includes('obsidian 插件'));
		expect(t!.description).not.toContain('gantt calendar 插件');
		expect(t!.description).not.toContain('拿到了');
	});
});
