/**
 * @jest-environment jsdom
 *
 * 悬浮窗详情渲染契约（2026-11-25）
 *
 * 断言真实渲染的 TooltipProvider：
 *  - 详情出现在标题（description）**下方**、属性区上方
 *  - 最多 4 行，超出显示「…还有 N 行」
 *  - ==高亮== 的等号被去掉
 *  - 无详情时不渲染详情块
 */

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TooltipProvider, useTaskTooltip } from '../src/ui/components/TooltipProvider';
import { TooltipClasses } from '../src/utils/bem';
import { initializeI18n } from '../src/i18n/i18n';
import type { GCTask } from '../src/types';

function installGlobals(): void {
	const g = window as unknown as Record<string, unknown> & { activeDocument?: Document };
	if (!g.activeDocument) g.activeDocument = document;
	const proto = HTMLElement.prototype as unknown as {
		hasClass?: (this: HTMLElement, cls: string) => boolean;
		addClass?: (this: HTMLElement, ...cls: string[]) => void;
		removeClass?: (this: HTMLElement, ...cls: string[]) => void;
		toggleClass?: (this: HTMLElement, cls: string, v: boolean) => void;
		setText?: (this: HTMLElement, t: string) => void;
	};
	if (!proto.hasClass) proto.hasClass = function (c: string) { return this.classList.contains(c); };
	if (!proto.addClass) proto.addClass = function (...c: string[]) { this.classList.add(...c); };
	if (!proto.removeClass) proto.removeClass = function (...c: string[]) { this.classList.remove(...c); };
	if (!proto.toggleClass) proto.toggleClass = function (c: string, v: boolean) { this.classList.toggle(c, v); };
	if (!proto.setText) proto.setText = function (t: string) { this.textContent = t; };
}

function mkTask(details?: string): GCTask {
	return {
		filePath: 'x.md',
		fileName: '2026-11-23',
		lineNumber: 9,
		content: '任务',
		description: '三十三-小群-拿1116包资源',
		details,
		status: 'important',
		tags: ['LifeAfter'],
		createdDate: new Date(2026, 10, 23),
		startDate: new Date(2026, 10, 23, 17, 45),
		dueDate: new Date(2026, 10, 23, 18, 45),
		datePrecision: { createdDate: 'day', startDate: 'time', dueDate: 'time' },
	} as unknown as GCTask;
}

/**
 * 挂载 Provider，并用一个探针组件在 effect 里调用 show(task, anchor)。
 * TooltipProvider 内部有 400ms 显示延迟，因此用 fake timers 推进。
 */
function mountAndShow(task: GCTask): { root: Root; container: HTMLElement; anchor: HTMLElement } {
	(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const anchor = document.createElement('div');
	document.body.appendChild(anchor);
	// jsdom 无布局，给 anchor 一个非零矩形，避免定位算法退化
	anchor.getBoundingClientRect = () => ({
		left: 100, top: 100, right: 200, bottom: 140, width: 100, height: 40, x: 100, y: 100, toJSON: () => ({}),
	});

	function Probe(): null {
		const tip = useTaskTooltip();
		useEffect(() => {
			tip.show(task, anchor);
		}, [tip]);
		return null;
	}

	const root = createRoot(container);
	act(() => {
		root.render(createElement(TooltipProvider, null, createElement(Probe)));
	});
	// 推进 show 的 400ms 延迟
	act(() => {
		jest.advanceTimersByTime(500);
	});
	return { root, container, anchor };
}

function getTooltip(): HTMLElement | null {
	return document.body.querySelector<HTMLElement>(`.${TooltipClasses.block}`);
}

describe('悬浮窗详情渲染', () => {
	beforeAll(async () => {
		installGlobals();
		await initializeI18n('zh');
	});

	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	test('有详情：详情块渲染在标题之后、属性区之前', () => {
		const { root } = mountAndShow(mkTask('第一行\n第二行'));
		try {
			const tip = getTooltip();
			expect(tip).not.toBeNull();
			const desc = tip!.querySelector(`.${TooltipClasses.elements.description}`);
			const det = tip!.querySelector(`.${TooltipClasses.elements.details}`);
			const props = tip!.querySelector(`.${TooltipClasses.elements.properties}`);
			expect(desc).not.toBeNull();
			expect(det).not.toBeNull();
			expect(props).not.toBeNull();

			// 顺序：description → details → properties
			const children = Array.from(tip!.children);
			const iDesc = children.indexOf(desc as Element);
			const iDet = children.indexOf(det as Element);
			const iProps = children.indexOf(props as Element);
			expect(iDesc).toBeLessThan(iDet);
			expect(iDet).toBeLessThan(iProps);
		} finally {
			act(() => root.unmount());
		}
	});

	test('详情内容正确且 == 等号已去除', () => {
		const { root } = mountAndShow(mkTask('==高亮一==\n普通二'));
		try {
			const det = getTooltip()!.querySelector(`.${TooltipClasses.elements.details}`)!;
			const lines = Array.from(det.querySelectorAll(`.${TooltipClasses.elements.detailsLine}`))
				.map((el) => el.textContent);
			expect(lines).toEqual(['高亮一', '普通二']);
			expect(det.textContent).not.toContain('==');
		} finally {
			act(() => root.unmount());
		}
	});

	test('8 行详情：只渲染 4 行 + 「…还有 4 行」', () => {
		const eight = Array.from({ length: 8 }, (_, i) => `第${i + 1}行`).join('\n');
		const { root } = mountAndShow(mkTask(eight));
		try {
			const det = getTooltip()!.querySelector(`.${TooltipClasses.elements.details}`)!;
			const lines = Array.from(det.querySelectorAll(`.${TooltipClasses.elements.detailsLine}`))
				.map((el) => el.textContent);
			expect(lines).toHaveLength(4);
			expect(lines).toEqual(['第1行', '第2行', '第3行', '第4行']);

			const more = det.querySelector(`.${TooltipClasses.elements.detailsMore}`);
			expect(more).not.toBeNull();
			expect(more!.textContent).toContain('4');
		} finally {
			act(() => root.unmount());
		}
	});

	test('无详情：不渲染详情块', () => {
		const { root } = mountAndShow(mkTask());
		try {
			const tip = getTooltip();
			expect(tip).not.toBeNull();
			const det = tip!.querySelector(`.${TooltipClasses.elements.details}`);
			expect(det).toBeNull();
			// 标题与属性区仍在
			expect(tip!.querySelector(`.${TooltipClasses.elements.description}`)).not.toBeNull();
			expect(tip!.querySelector(`.${TooltipClasses.elements.properties}`)).not.toBeNull();
		} finally {
			act(() => root.unmount());
		}
	});

	test('恰好 4 行：渲染 4 行且无「还有」提示', () => {
		const four = '1\n2\n3\n4';
		const { root } = mountAndShow(mkTask(four));
		try {
			const det = getTooltip()!.querySelector(`.${TooltipClasses.elements.details}`)!;
			expect(det.querySelectorAll(`.${TooltipClasses.elements.detailsLine}`)).toHaveLength(4);
			expect(det.querySelector(`.${TooltipClasses.elements.detailsMore}`)).toBeNull();
		} finally {
			act(() => root.unmount());
		}
	});
});
