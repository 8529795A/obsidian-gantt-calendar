/**
 * 任务详情（任务行下方内容）— 解析与写回契约（2026-11-25）
 *
 * 用户需求：
 *  1. 编辑面板「任务描述」改名为「任务标题」
 *  2. 新增「详情」字段，内容就是任务行下方那些高亮的多行文字
 *
 * 真实笔记形态（2026-11-23.md 实测）：
 * ```
 * - [ ] 🎯 #LifeAfter 三十三-小群-拿1116包资源 ➕ ... 📅 2026-11-23 18:45
 * ==拿到了 1116 版本的包以及补丁==          ← 无缩进的惰性续行
 * \t==「qq.zip」，复制整段内容…==              ← Tab 缩进子内容
 * \t==链接：https://pan.quark.cn/s/...==
 *
 * - [ ] 🎯 #plugin obsidian 插件 ...          ← 下一条任务
 * ```
 * 第 2~N 行都属于第一条任务的「详情」。
 */

import {
	findDetailEndLine,
	extractDetailLines,
	normalizeDetailLines,
	formatDetailLines,
	detectTabIndent,
} from '../src/tasks/taskDetails';

/** 构造真实笔记结构（与 2026-11-23.md 一致：首行无缩进 + Tab 缩进） */
const NOTE = [
	'',
	'- [ ] 🎯 #LifeAfter 三十三-小群-拿1116包资源 ➕ 2026-11-23 🛫 2026-11-23 17:45 📅 2026-11-23 18:45',
	'==拿到了 1116 版本的包以及补丁==',
	'\t==「qq.zip」，复制整段内容，打开最新版「夸克APP」即可获取。==',
	'\t==畅享原画，免费5倍速播放，支持AI字幕和投屏，更有网盘TV版。==',
	'\t==链接：https://pan.quark.cn/s/30fe1d37d3be==',
	'',
	'- [ ] 🎯 #plugin obsidian 插件 ➕ 2026-11-23 🛫 2026-11-23 21:45 📅 2026-11-23 22:45',
	'==gantt calendar 插件==',
	'',
	'- [ ] 🎯 fork gannt calendar 插件(3) ➕ 2026-11-23 🛫 2026-11-23 23:21 📅 2026-11-23 23:59 #harness',
];

describe('详情块边界推断', () => {
	test('第一条任务：详情覆盖无缩进续行 + Tab 子行，止于下一个任务', () => {
		// 任务在第 2 行（索引 1）
		const end = findDetailEndLine(NOTE, 1, 0);
		// 详情为索引 2..5（含），结束索引应为 6（空行处终止）
		expect(end).toBe(6);
		const raw = extractDetailLines(NOTE, 1, 0);
		expect(raw).toHaveLength(4);
		expect(raw[0]).toContain('拿到了 1116 版本的包');
		expect(raw[3]).toContain('pan.quark.cn');
	});

	test('第二条任务：只取自己的一行详情', () => {
		const raw = extractDetailLines(NOTE, 7, 0);
		expect(raw).toEqual(['==gantt calendar 插件==']);
	});

	test('无详情的任务返回空数组', () => {
		const raw = extractDetailLines(NOTE, 10, 0);
		expect(raw).toEqual([]);
	});

	test('标题行终止详情', () => {
		const lines = ['- [ ] 任务', '详情一', '## 新标题', '不属于详情'];
		expect(extractDetailLines(lines, 0, 0)).toEqual(['详情一']);
	});

	test('同级列表项终止详情，更深子列表属于详情', () => {
		const lines = ['- [ ] 任务', '  - 子项', '- 同级项'];
		expect(extractDetailLines(lines, 0, 0)).toEqual(['  - 子项']);
	});
});

describe('详情缩进归一化（1:1 保留 Obsidian 格式）', () => {
	test('混排（首行顶格 + 其余 Tab）原样保留相对缩进', () => {
		const raw = extractDetailLines(NOTE, 1, 0);
		const text = normalizeDetailLines(raw);
		const lines = text.split('\n');
		expect(lines).toHaveLength(4);
		// 首行原本顶格 → 保持顶格
		expect(lines[0]).toBe('==拿到了 1116 版本的包以及补丁==');
		// 后续行原本带 1 个 Tab → 保持 1 个 Tab（1:1 忠实原文）
		expect(lines[1].startsWith('\t')).toBe(true);
		expect(lines[1]).toBe('\t==「qq.zip」，复制整段内容，打开最新版「夸克APP」即可获取。==');
		expect(lines[3]).toContain('pan.quark.cn');
	});

	test('高亮 == 语法原样保留（不剥符号）', () => {
		const text = normalizeDetailLines(['==高亮文字==']);
		expect(text).toBe('==高亮文字==');
	});

	test('多级 Tab 层级原样保留', () => {
		const raw = ['\t父级', '\t\t子级'];
		// 公共缩进为 1 个 Tab，剥掉这一层后剩 0 / 1 个 Tab
		expect(normalizeDetailLines(raw)).toBe('父级\n\t子级');
	});

	test('子列表符号原样保留', () => {
		const raw = ['- 列表项一', '\t- 子项'];
		expect(normalizeDetailLines(raw)).toBe('- 列表项一\n\t- 子项');
	});

	test('空详情返回空串', () => {
		expect(normalizeDetailLines([])).toBe('');
		expect(normalizeDetailLines(['', '  '])).toBe('');
	});
});

describe('详情写回格式化', () => {
	test('多行详情统一加一级缩进（Tab 风格）', () => {
		const out = formatDetailLines('第一行\n第二行', '', true);
		expect(out).toEqual(['\t第一行', '\t第二行']);
	});

	test('多行详情统一加一级缩进（空格风格）', () => {
		const out = formatDetailLines('第一行\n第二行', '', false);
		expect(out).toEqual(['  第一行', '  第二行']);
	});

	test('任务本身有缩进时叠加', () => {
		const out = formatDetailLines('内容', '  ', false);
		expect(out).toEqual(['    内容']);
	});

	test('空串 / 纯空白 → 无详情行（清除详情）', () => {
		expect(formatDetailLines('', '', false)).toEqual([]);
		expect(formatDetailLines('   \n\n  ', '', false)).toEqual([]);
	});

	test('保留详情内部的相对缩进（不再吞掉一层 Tab）', () => {
		const out = formatDetailLines('父级\n\t子级', '', true);
		// 每行统一补 1 个 Tab；原本的 1 个 Tab 子级变成 2 个 Tab，层级不丢
		expect(out).toEqual(['\t父级', '\t\t子级']);
	});

	test('高亮 == 原样写回（1:1）', () => {
		const out = formatDetailLines('==高亮==', '', true);
		expect(out).toEqual(['\t==高亮==']);
	});

	test('首尾空行被裁掉', () => {
		const out = formatDetailLines('\n\n内容\n\n', '', false);
		expect(out).toEqual(['  内容']);
	});

	test('CRLF 被归一化', () => {
		const out = formatDetailLines('A\r\nB', '', false);
		expect(out).toEqual(['  A', '  B']);
	});
});

describe('缩进风格检测', () => {
	test('原文含 Tab → 判定为 Tab 风格', () => {
		expect(detectTabIndent(['无缩进', '\t有 Tab'])).toBe(true);
	});

	test('原文纯空格 → 非 Tab 风格', () => {
		expect(detectTabIndent(['无缩进', '  两空格'])).toBe(false);
	});

	test('无详情 → 非 Tab 风格', () => {
		expect(detectTabIndent([])).toBe(false);
	});
});

describe('往返一致性：解析 → 归一化 → 写回 → 再解析', () => {
	test('真实笔记详情往返后内容与层级不变（幂等，不累积缩进）', () => {
		const raw = extractDetailLines(NOTE, 1, 0);
		const normalized = normalizeDetailLines(raw);
		const preferTab = detectTabIndent(raw);
		const written = formatDetailLines(normalized, '', preferTab);

		// 重建文件：任务行 + 新详情 + 后续内容
		const rebuilt = [
			NOTE[0],
			NOTE[1],
			...written,
			'',
			...NOTE.slice(7),
		];

		// 再次解析详情，文本应与首次归一化结果完全一致
		const raw2 = extractDetailLines(rebuilt, 1, 0);
		expect(normalizeDetailLines(raw2)).toBe(normalized);
	});

	test('连续往返 3 轮不累积缩进', () => {
		let lines: string[] = [
			'- [ ] 任务',
			'==第一行==',
			'\t==第二行==',
			'',
			'- [ ] 下一个',
		];
		let prev = '';
		for (let round = 0; round < 3; round++) {
			const raw = extractDetailLines(lines, 0, 0);
			const normalized = normalizeDetailLines(raw);
			const written = formatDetailLines(normalized, '', detectTabIndent(raw));
			if (round > 0) {
				// 第 2、3 轮结果必须与上一轮完全一致（幂等）
				expect(normalized).toBe(prev);
			}
			prev = normalized;
			lines = [lines[0], ...written, '', '- [ ] 下一个'];
		}
		expect(prev).toBe('==第一行==\n\t==第二行==');
	});
});
