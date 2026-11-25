/**
 * 悬浮窗详情区样式契约（2026-11-25）
 *
 * 用户要求：悬浮窗的任务详情要有灰色底色（与下方属性区同款底板）。
 * 本测试直接读 styles 源文件，锁定：
 *  - `__details` 有 background-color（灰底）
 *  - 灰底与属性区使用同一 token（视觉统一）
 *  - 详情行用 white-space: pre 保留缩进层级
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const CSS_PATH = join(__dirname, '..', 'src', 'styles', 'components', 'tooltip.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** 取出某个选择器的规则体 */
function ruleBody(selector: string): string {
	const idx = css.indexOf(selector);
	if (idx === -1) return '';
	const open = css.indexOf('{', idx);
	const close = css.indexOf('}', open);
	return css.slice(open + 1, close);
}

describe('悬浮窗详情区样式', () => {
	test('详情区有灰色底色，且与属性区使用同一 token', () => {
		const details = ruleBody('.gc-task-tooltip .gc-task-tooltip__details {');
		expect(details).toContain('background-color: var(--background-secondary)');

		// 属性区也用同一个灰底 token（视觉统一）
		const section = ruleBody('.gc-task-tooltip .gc-task-tooltip__property-section {');
		expect(section).toContain('background-color: var(--background-secondary)');
	});

	test('详情区有圆角与内边距（与属性卡片一致的卡片感）', () => {
		const details = ruleBody('.gc-task-tooltip .gc-task-tooltip__details {');
		expect(details).toMatch(/border-radius:\s*\d+px/);
		expect(details).toMatch(/padding:\s*[\d\s px]+/);
	});

	test('详情行用 white-space: pre 保留缩进层级', () => {
		const line = ruleBody('.gc-task-tooltip .gc-task-tooltip__details-line {');
		expect(line).toContain('white-space: pre');
		// 仍需单行省略，避免长链接撑爆宽度
		expect(line).toContain('text-overflow: ellipsis');
		expect(line).toContain('overflow: hidden');
	});

	test('「还有 N 行」提示为淡色', () => {
		const more = ruleBody('.gc-task-tooltip .gc-task-tooltip__details-more {');
		expect(more).toContain('--text-faint');
	});
});
