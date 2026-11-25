/**
 * 任务详情（任务行下方属于该列表项的内容）
 *
 * 背景：任务在 Markdown 里长这样——
 *
 * ```md
 * - [ ] 🎯 #LifeAfter life-QQ大群大砍 ➕ 2026-11-23 🛫 2026-11-23 14:30
 * ==QQ群聊被内鬼渗透，安装包被倒狗贩卖==
 * ==717654378QQ群聊人数被精简==
 * - [ ] 🎯 下一个任务 ...
 * ```
 *
 * 第 2、3 行是第 1 行列表项的「惰性续行」（lazy continuation），
 * 在 Obsidian / CommonMark 里都属于该列表项的内容，也就是任务的「详情」。
 *
 * 这里统一实现「详情块边界推断 + 缩进归一化」，供解析（读）与写回（写）共用，
 * 保证两条路径对同一文件的边界判断完全一致。
 *
 * @fileoverview 任务详情块的解析与格式化
 * @module tasks/taskDetails
 */

import { parseTaskLine } from './taskParser/step1';

/** Markdown 标题行（`#` ~ `######` + 空格） */
const HEADING_REGEX = /^#{1,6}\s/;

/** 列表项标记（`-` / `*` / `+` / `1.` / `1)`），用于判断是否进入了下一个列表项 */
const LIST_MARKER_REGEX = /^([ \t>]*)([-*+]|\d+[.)])(\s|$)/;

/** 行首缩进宽度（Tab 记 1，与「字符前缀」口径一致，仅用于比较层级） */
function indentWidth(line: string): number {
	return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

/** 是否为空行 */
function isBlank(line: string): boolean {
	return line.trim() === '';
}

/**
 * 计算任务详情块的结束行索引（不含）。
 *
 * 规则（与 CommonMark 列表项的延续规则一致）：
 * 1. 空行：向后看，若后续首个非空行是缩进内容 → 空行属于详情块并继续；
 *    否则详情块在空行处结束（避免把下一个任务前的空行也算进来）。
 * 2. 新的任务行 → 结束。
 * 3. 标题行 → 结束。
 * 4. 同级或更浅缩进的列表项 → 结束。
 * 5. 其余非空行（含无缩进的惰性续行、更深的缩进子内容）→ 属于详情块。
 *
 * @param lines 文件的全部行
 * @param taskLineIndex 任务行索引（0-based）
 * @param taskIndent 任务行自身的缩进宽度
 * @returns 详情块结束索引（不含），无详情时等于 taskLineIndex + 1
 */
export function findDetailEndLine(
	lines: readonly string[],
	taskLineIndex: number,
	taskIndent: number,
): number {
	let i = taskLineIndex + 1;
	let end = taskLineIndex + 1;

	while (i < lines.length) {
		const line = lines[i];

		if (isBlank(line)) {
			// 空行后若仍是缩进内容，则空行与后续内容都属于详情块
			let j = i + 1;
			while (j < lines.length && isBlank(lines[j])) j++;
			if (j >= lines.length) break;
			const next = lines[j];
			if (indentWidth(next) > taskIndent && !parseTaskLine(next) && !HEADING_REGEX.test(next)) {
				i = j;
				continue;
			}
			break;
		}

		// 新的任务行：绝不属于上一条任务的详情
		if (parseTaskLine(line)) break;

		// 标题行：结束
		if (HEADING_REGEX.test(line)) break;

		// 列表项：同级或更浅 → 结束；更深 → 视为任务的子列表，属于详情
		const listMatch = line.match(LIST_MARKER_REGEX);
		if (listMatch && indentWidth(line) <= taskIndent) break;

		i++;
		end = i;
	}

	return end;
}

/**
 * 提取任务行下方的详情块原始行。
 *
 * @returns 原始行数组（可能为空数组）
 */
export function extractDetailLines(
	lines: readonly string[],
	taskLineIndex: number,
	taskIndent: number,
): string[] {
	const end = findDetailEndLine(lines, taskLineIndex, taskIndent);
	const raw = lines.slice(taskLineIndex + 1, end);
	// 去掉尾部空行（详情块末尾的空行不算内容）
	while (raw.length > 0 && isBlank(raw[raw.length - 1])) raw.pop();
	return raw;
}

/**
 * 详情块缩进归一化（读入方向）。
 *
 * **1:1 保留原文格式**（用户要求）：`==高亮==`、Tab 缩进层级、子列表符号
 * 全部原样呈现，编辑器里看到的就是笔记里的内容，不做任何「美化」。
 *
 * 唯一处理：剥掉**所有非空行共有的**那一层列表缩进前缀。
 * 理由：详情本身已经属于任务的子内容，那层缩进是 Markdown 结构的一部分
 * （写回时 {@link formatDetailLines} 会统一加回），剥掉它不会丢失任何
 * 用户可见的层级信息——行与行之间的相对缩进（Tab / 多级子列表）完整保留。
 *
 * 例（`·` 表示一个 Tab）：
 * ```
 * 原文： ==拿到了 1116 版本的包==
 *       ··==「qq.zip」…==
 *       ··链接：https://…==
 * 结果： ==拿到了 1116 版本的包==
 *       ·==「qq.zip」…==
 *       ·链接：https://…==
 * ```
 * 首行顶格、后续行多一层 Tab 的混排也照样保留（不再拉平），
 * 因为那正是用户手写的真实层级。
 *
 * @param rawLines 原始详情行
 * @returns 详情文本（`\n` 连接），无内容时返回空字符串
 */
export function normalizeDetailLines(rawLines: readonly string[]): string {
	if (rawLines.length === 0) return '';

	// 公共缩进 = 所有非空行缩进宽度的最小值（只剥这一层）
	let minIndent = Infinity;
	for (const line of rawLines) {
		if (isBlank(line)) continue;
		minIndent = Math.min(minIndent, indentWidth(line));
	}
	if (!Number.isFinite(minIndent)) minIndent = 0;

	const stripped = rawLines.map((line) => {
		if (isBlank(line)) return '';
		return line.slice(Math.min(minIndent, indentWidth(line)));
	});

	// 去掉首尾空行
	while (stripped.length > 0 && stripped[0] === '') stripped.shift();
	while (stripped.length > 0 && stripped[stripped.length - 1] === '') stripped.pop();

	return stripped.join('\n');
}

/**
 * 详情块缩进归一化（写回方向）。
 *
 * 把编辑器里的多行文本按「任务缩进 + 一级缩进」重新排版。
 * **行内的相对缩进原样保留**（1:1 忠实于编辑器内容）：用户写了几层 Tab
 * 就写回几层，不会被吞掉。
 *
 * 缩进字符跟随原文风格：原文用过 Tab 就继续用 Tab，否则用 2 空格。
 *
 * @param details 详情文本（可为多行，空串表示清除详情）
 * @param taskIndent 任务行自身的缩进字符串
 * @param preferTab 是否优先使用 Tab 缩进
 * @returns 可直接写入文件的详情行数组（空数组表示无详情）
 */
export function formatDetailLines(
	details: string,
	taskIndent: string,
	preferTab: boolean,
): string[] {
	const text = (details ?? '').replace(/\r\n?/g, '\n');
	if (text.trim() === '') return [];

	const unit = preferTab ? '\t' : '  ';
	const lines = text.split('\n');

	// 去掉首尾空行
	while (lines.length > 0 && lines[0].trim() === '') lines.shift();
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

	return lines.map((line) => {
		if (line.trim() === '') return '';
		// 仅补一级缩进，行内已有的相对缩进（Tab/空格）原样保留
		return `${taskIndent}${unit}${line}`;
	});
}

/**
 * 原文详情块是否使用 Tab 缩进（决定写回时的缩进风格）。
 */
export function detectTabIndent(rawLines: readonly string[]): boolean {
	return rawLines.some((line) => line.startsWith('\t') || /^[ \t]*\t/.test(line));
}
