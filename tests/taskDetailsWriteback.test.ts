/**
 * 详情写回端到端（2026-11-25）
 *
 * 模拟 updateTaskProperties 的核心写回步骤（不依赖 Obsidian 运行时）：
 *  - 修改详情：任务行保留、详情块按新内容重排、下一条任务不受影响
 *  - 清除详情：详情块被移除，其余内容不动
 *  - 不传 details：详情块原样保留（避免误删用户在 Obsidian 手写的内容）
 */

import { findDetailEndLine, formatDetailLines, detectTabIndent } from '../src/tasks/taskDetails';

/** 真实笔记结构（2026-11-23.md 前 12 行） */
function makeNote(): string[] {
	return [
		'',
		'- [ ] 🎯 #LifeAfter life-QQ大群大砍 ➕ 2026-11-23 🛫 2026-11-23 14:30 📅 2026-11-23 17:00',
		'==QQ群聊被内鬼渗透，安装包被倒狗贩卖==',
		'==717654378QQ群聊人数被精简==',
		'==倒狗、内鬼排查==',
		'',
		'',
		'',
		'- [ ] 🎯 #LifeAfter 三十三-小群-拿1116包资源 ➕ 2026-11-23 🛫 2026-11-23 17:45 📅 2026-11-23 18:45',
		'==拿到了 1116 版本的包以及补丁==',
		'\t==「qq.zip」，复制整段内容==',
		'\t==链接：https://pan.quark.cn/s/30fe1d37d3be==',
		'',
		'- [ ] 🎯 #plugin obsidian 插件 ➕ 2026-11-23 🛫 2026-11-23 21:45 📅 2026-11-23 22:45',
		'==gantt calendar 插件==',
	];
}

/** 复刻 taskUpdater 中「替换详情块」的步骤 */
function applyDetailUpdate(
	lines: string[],
	taskLineIndex: number,
	newDetails: string | null,
): string[] {
	const taskLine = lines[taskLineIndex];
	const indent = taskLine.match(/^([\s\t>]*)/)?.[1] ?? '';
	const detailStart = taskLineIndex + 1;
	const detailEnd = findDetailEndLine(lines, taskLineIndex, indent.length);
	const rawDetail = lines.slice(detailStart, detailEnd);
	const preferTab = detectTabIndent(rawDetail);
	const newDetailLines = formatDetailLines(newDetails ?? '', indent, preferTab);
	const out = [...lines];
	out.splice(detailStart, Math.max(0, detailEnd - detailStart), ...newDetailLines);
	return out;
}

describe('详情写回', () => {
	test('修改第一条任务详情：下一条任务与其它内容不受影响', () => {
		const note = makeNote();
		const out = applyDetailUpdate(note, 1, '新的详情 A\n新的详情 B');

		// 任务行不变
		expect(out[1]).toBe(note[1]);
		// 新详情写入。第一条任务原文详情全为「无缩进」行 → 判定为非 Tab 风格，
		// 因此用 2 空格缩进（跟随原文风格，不强行改写成 Tab）。
		expect(out[2]).toBe('  新的详情 A');
		expect(out[3]).toBe('  新的详情 B');
		// 第一条任务的旧详情（3 行）被替换为 2 行
		expect(out).not.toContain('==倒狗、内鬼排查==');
		// 第二条任务仍在，且内容完整
		const idx = out.findIndex((l) => l.includes('三十三-小群'));
		expect(idx).toBeGreaterThan(0);
		expect(out[idx + 1]).toBe('==拿到了 1116 版本的包以及补丁==');
		// 第三条任务完好
		expect(out.some((l) => l.includes('obsidian 插件'))).toBe(true);
	});

	test('清除详情：详情块删除，任务行与后续任务保留', () => {
		const note = makeNote();
		const out = applyDetailUpdate(note, 1, null);

		expect(out[1]).toBe(note[1]);
		expect(out).not.toContain('==QQ群聊被内鬼渗透，安装包被倒狗贩卖==');
		expect(out).not.toContain('==倒狗、内鬼排查==');
		// 下一条任务仍在
		expect(out.some((l) => l.includes('三十三-小群'))).toBe(true);
		// 总行数减少 3（原 3 行详情被删）
		expect(out.length).toBe(note.length - 3);
	});

	test('多行详情写回后再读，内容与行数一致', () => {
		const note = makeNote();
		const text = '第一行\n第二行\n第三行';
		const out = applyDetailUpdate(note, 1, text);

		const detailEnd = findDetailEndLine(out, 1, 0);
		const raw = out.slice(2, detailEnd);
		// 剥掉写回时统一加上的缩进（本例为 2 空格），内容应与输入一致
		const stripped = raw.map((l) => l.replace(/^[ \t]+/, '')).join('\n');
		expect(stripped).toBe(text);
	});

	test('第二条任务详情写回：只影响自己', () => {
		const note = makeNote();
		const out = applyDetailUpdate(note, 8, '替换后的详情');
		// 第一条任务详情完好
		expect(out).toContain('==QQ群聊被内鬼渗透，安装包被倒狗贩卖==');
		expect(out).toContain('==倒狗、内鬼排查==');
		// 第二条任务旧详情被替换
		expect(out).not.toContain('==拿到了 1116 版本的包以及补丁==');
		expect(out.some((l) => l.includes('替换后的详情'))).toBe(true);
		// 第三条任务完好
		expect(out).toContain('==gantt calendar 插件==');
	});
});
