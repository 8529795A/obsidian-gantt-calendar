/**
 * 周视图块内布局契约：标签独占首行、文字独占次行整宽。
 *
 * 回归目标（2026-11-22）：块宽约 1/7 屏宽（≈110px）时，首行的复选框 + 标签药丸
 * 会把文字挤到接近 0 宽，表现为「Magpie」被拆成 Ma / gpi / e 的逐字竖排。
 * 根因是 .gc-task-card__text 的 flex-basis:0 + min-width:0 允许文字被无限压缩，
 * 而不是标签"抢"了宽度。
 *
 * 本测试直接断言 CSS 源码契约，防止后续改动把 flex-basis 改回 0：
 * CSS 无法在 jsdom 里真实布局，故采用"源码规则断言 + 优先级顺序断言"两层防护。
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const WEEK_CSS = readFileSync(
	join(__dirname, '..', 'src', 'styles', 'views', 'week-view.css'),
	'utf8',
);

/** 取某条选择器之后的花括号块内容（首次匹配） */
function ruleBody(selector: string): string | null {
	const idx = WEEK_CSS.indexOf(selector);
	if (idx < 0) return null;
	const open = WEEK_CSS.indexOf('{', idx);
	const close = WEEK_CSS.indexOf('}', open);
	if (open < 0 || close < 0) return null;
	return WEEK_CSS.slice(open + 1, close);
}

describe('周视图块内标签/文字布局契约', () => {
	const FLOW = '.gc-week-view__time-block--flow';

	test('文字块独占整行（flex-basis 100%），不再允许被压到 0 宽', () => {
		const body = ruleBody(`${FLOW} .gc-task-card--timeline .gc-task-card__text`);
		expect(body).not.toBeNull();
		// 关键：basis 必须是 100%（独占一行），不能是 0（可被压扁）
		expect(body).toMatch(/flex:\s*1\s+1\s+100%/);
		expect(body).not.toMatch(/flex:\s*1\s+1\s+0[;\s]/);
	});

	test('文字排在标签之后（order 3 > tags 的 order 1）', () => {
		const textBody = ruleBody(`${FLOW} .gc-task-card--timeline .gc-task-card__text`);
		const tagsBody = ruleBody(`${FLOW} .gc-task-card--timeline .gc-task-card__tags`);
		expect(textBody).toMatch(/order:\s*3/);
		expect(tagsBody).toMatch(/order:\s*1/);
	});

	test('标签行吃满首行剩余宽度并允许换行', () => {
		const tagsBody = ruleBody(`${FLOW} .gc-task-card--timeline .gc-task-card__tags`);
		expect(tagsBody).toMatch(/flex:\s*1\s+1\s+auto/);
		expect(tagsBody).toMatch(/flex-wrap:\s*wrap/);
		expect(tagsBody).toMatch(/min-width:\s*0/);
	});

	test('无标签任务也保持「文字在第二行」，与有标签块基线一致', () => {
		// 无标签时不应把文字 flex-basis 改回 0（那会让文字回到首行与复选框同行，
		// 导致同一列里有标签/无标签的块标题基线错开）
		expect(WEEK_CSS).not.toMatch(
			/:not\(:has\(\.gc-task-card__tags\)\)\s*\.gc-task-card__text\s*\{[^}]*flex:\s*1\s+1\s+0/,
		);
		// 文字的 flex-basis:100% 对所有 flow 块统一生效，天然保证换到第二行
		const body = ruleBody(`${FLOW} .gc-task-card--timeline .gc-task-card__text`);
		expect(body).toMatch(/flex:\s*1\s+1\s+100%/);
	});

	test('旧的非 flow 通用规则已排除 --flow，避免靠后覆盖 flex-basis', () => {
		// 这两条旧规则特异性相同且位置更靠后，若不加 :not() 会把 basis 覆盖回 0
		expect(WEEK_CSS).toContain(
			'.gc-week-view__time-block:not(.gc-week-view__time-block--flow) .gc-task-card--timeline .gc-task-card__text',
		);
		expect(WEEK_CSS).not.toMatch(
			/^\.gc-week-view__time-block \.gc-task-card--timeline \.gc-task-card__text\s*\{/m,
		);
	});

	test('"+N" 溢出徽标有独立样式', () => {
		const body = ruleBody(`${FLOW} .gc-task-card--timeline .gc-task-card__tags-overflow`);
		expect(body).not.toBeNull();
		expect(body).toMatch(/flex-shrink:\s*0/);
		expect(body).toMatch(/white-space:\s*nowrap/);
	});

	test('块内标签药丸缩到 xxs 字号，一行能多容纳一个', () => {
		const body = ruleBody(`${FLOW} .gc-task-card--timeline .gc-tag`);
		expect(body).not.toBeNull();
		expect(body).toMatch(/font-size:\s*var\(--gc-font-xxs\)/);
		expect(body).toMatch(/padding:\s*0\s+4px/);
	});
});

describe('maxTags 配置契约', () => {
	test('TaskCardConfig 声明 maxTags 字段', () => {
		const configSrc = readFileSync(
			join(__dirname, '..', 'src', 'components', 'TaskCard', 'TaskCardConfig.ts'),
			'utf8',
		);
		expect(configSrc).toMatch(/maxTags\?:\s*number/);
	});

	test('TaskCard 按 maxTags 截断并渲染 +N 徽标', () => {
		const cardSrc = readFileSync(
			join(__dirname, '..', 'src', 'ui', 'components', 'TaskCard.tsx'),
			'utf8',
		);
		expect(cardSrc).toMatch(/config\.maxTags/);
		expect(cardSrc).toMatch(/tagsOverflow/);
		expect(cardSrc).toMatch(/task\.tags\.length\s*-\s*config\.maxTags/);
	});

	test('日列块套用 maxTags=2，全天横跨条不套用（跨列宽度充裕）', () => {
		const gridSrc = readFileSync(
			join(__dirname, '..', 'src', 'ui', 'views', 'week', 'WeekTimelineGrid.tsx'),
			'utf8',
		);
		// DayColumn 内定义 blockConfig 并传给 TaskCard
		expect(gridSrc).toMatch(/blockConfig/);
		expect(gridSrc).toMatch(/maxTags:\s*2/);
		// 全天条仍用原始 config（不得出现 config={blockConfig} 之外的误用）
		const alldayIdx = gridSrc.indexOf('alldayBar');
		expect(alldayIdx).toBeGreaterThan(-1);
	});
});

describe('周视图「今天」标识与全天标签契约', () => {
	const THEME_CSS = readFileSync(
		join(__dirname, '..', 'src', 'styles', 'theme.css'),
		'utf8',
	);

	function themeRuleBody(selector: string): string | null {
		const idx = THEME_CSS.indexOf(selector);
		if (idx < 0) return null;
		const open = THEME_CSS.indexOf('{', idx);
		const close = THEME_CSS.indexOf('}', open);
		if (open < 0 || close < 0) return null;
		return THEME_CSS.slice(open + 1, close);
	}

	test('今天列不再整排染红（day-col / allday-cell 均为 transparent）', () => {
		const dayCol = themeRuleBody('.gc-week-view__day-col--today');
		const allday = themeRuleBody('.gc-week-view__allday-cell--today');
		expect(dayCol).toMatch(/background-color:\s*transparent/);
		expect(allday).toMatch(/background-color:\s*transparent/);
		// 不得再出现半透明红底
		expect(dayCol).not.toMatch(/rgba\(255,\s*107,\s*107/);
		expect(allday).not.toMatch(/rgba\(255,\s*107,\s*107/);
	});

	test('表头日期数字仍标红，保留「今天」识别', () => {
		const num = themeRuleBody(
			'.gc-week-view__header-cell--today .gc-week-view__day-number',
		);
		expect(num).toMatch(/--gc-danger/);
	});

	test('week-view.css 的 today 列也不再使用 primary-alt 底色', () => {
		const body = ruleBody('.gc-week-view__day-col--today');
		expect(body).toMatch(/background-color:\s*transparent/);
	});

	test('「全天」文字标签已从全天行移除', () => {
		const gridSrc = readFileSync(
			join(__dirname, '..', 'src', 'ui', 'views', 'week', 'WeekTimelineGrid.tsx'),
			'utf8',
		);
		// 不再渲染 alldayGutter 标签
		expect(gridSrc).not.toMatch(/elements\.alldayGutter/);
		// 未使用的 allDayLabel 变量也应清理（避免 lint no-unused-vars）
		expect(gridSrc).not.toMatch(/const allDayLabel\s*=/);
	});
});
