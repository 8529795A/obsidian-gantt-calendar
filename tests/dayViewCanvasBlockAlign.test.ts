/**
 * @jest-environment jsdom
 *
 * 日视图双时间轴：块定位与时间刻度对齐契约（2026-11-23）
 *
 * 用户报告：截止 21:00 的块，在右栏（12:00–24:00）里下边缘只到约 18:40，
 * 与右侧时间刻度不匹配。
 *
 * 本测试直接渲染真实 DayTimelineCanvas，断言块的内联 top/height 与
 * 模型给出的时间一致——不依赖像素截图，避免浮层/缩放的干扰。
 *
 * 关键契约：
 *   top    = (clippedStart - windowStartMin) / 60 * HOUR_PX
 *   height = (clippedEnd - clippedStart) / 60 * HOUR_PX
 * 即 21:00 的块在右栏应有 (21-12)*50 = 450px 高，且时间标签显示 12:00 – 21:00。
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DayTimelineCanvas } from '../src/ui/views/week/DayTimelineCanvas';
import { PluginContext } from '../src/ui/pluginContext';
import { TooltipProvider } from '../src/ui/components/TooltipProvider';
import { buildDayTimelineModel, HOUR_PX } from '../src/ui/views/week/timelineModel';
import { DayCanvasClasses } from '../src/utils/bem';
import type { GCTask } from '../src/types';
import type { TaskCardConfig } from '../src/components/TaskCard/TaskCardConfig';

const plugin = {
	app: {
		workspace: { getLeaf: () => null },
		vault: { getAbstractFileByPath: () => null },
	},
	settings: {
		ganttStartField: 'startDate',
		ganttEndField: 'dueDate',
		enabledTaskFormats: ['tasks'],
		taskCardClickAction: 'openFile',
		taskStatuses: [],
		globalTaskFilter: '',
		showGlobalFilterInTaskText: false,
		recurringTaskDisplayLimit: 5,
	},
	taskCache: { refreshFile: async () => {}, getAllTasks: () => [] },
} as unknown as IPluginContextLike;

type IPluginContextLike = Parameters<typeof PluginContext.Provider>[0]['value'];

/**
 * 补齐 Obsidian 运行时的全局扩展（jsdom 缺失）：
 * - activeDocument：taskStatus.getCurrentThemeMode 依赖
 * - HTMLElement.hasClass：Obsidian 扩展方法
 */
function installObsidianGlobals(): void {
	const g = globalThis as unknown as { activeDocument?: Document };
	if (!g.activeDocument) g.activeDocument = document;

	const proto = HTMLElement.prototype as unknown as {
		hasClass?: (this: HTMLElement, cls: string) => boolean;
		addClass?: (this: HTMLElement, ...cls: string[]) => void;
	};
	if (!proto.hasClass) {
		proto.hasClass = function hasClass(this: HTMLElement, cls: string) {
			return this.classList.contains(cls);
		};
	}
	if (!proto.addClass) {
		proto.addClass = function addClass(this: HTMLElement, ...cls: string[]) {
			this.classList.add(...cls);
		};
	}
}

const config: TaskCardConfig = {
	viewModifier: 'day',
	showDescription: true,
	showTags: false,
	showFileLocation: false,
	showWarning: false,
	showTicktick: false,
	showTimes: false,
	enableTooltip: false,
	enableDrag: false,
	clickable: false,
	variant: 'timeline',
};

function mkTask(desc: string, s: Date, e: Date): GCTask {
	return {
		description: desc,
		filePath: 'x.md',
		lineNumber: 1,
		fileName: 'x',
		completed: false,
		rawText: '',
		startDate: s,
		dueDate: e,
		datePrecision: { startDate: 'time', dueDate: 'time' },
		tags: [],
		metadataFields: [],
	} as unknown as GCTask;
}

/** 挂载画布，返回容器与清理函数 */
function mountCanvas(startHour: number, endHour: number): { container: HTMLElement; root: Root; day: Date } {
	// jsdom 下 createRoot 需要显式声明 act 环境，否则 React 警告且不保证同步提交
	(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const day = new Date(2026, 10, 22);
	const tasks = [
		mkTask('test', new Date(2026, 10, 22, 9, 45), new Date(2026, 10, 22, 21, 0)),
	];
	const model = buildDayTimelineModel(tasks, day, 'startDate', 'dueDate');
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(
				PluginContext.Provider,
				{ value: plugin as IPluginContextLike },
				createElement(
					TooltipProvider,
					null,
					createElement(DayTimelineCanvas, {
						day,
						model,
						config,
						tasks,
						refresh: () => {},
						startHour,
						endHour,
					}),
				),
			),
		);
	});
	return { container, root, day };
}

/** 读取画布与其内块的内联样式（px 数值） */
function readCanvas(container: HTMLElement): {
	canvasHeight: number;
	blockTop: number | null;
	blockHeight: number | null;
	label: string | null;
} {
	const canvas = container.querySelector(`.${DayCanvasClasses.elements.canvas}`) as HTMLElement | null;
	const block = container.querySelector(`.${DayCanvasClasses.elements.block}`) as HTMLElement | null;
	const labelEl = block?.querySelector(`.${DayCanvasClasses.elements.blockTime}`) as HTMLElement | null;
	const px = (v: string) => parseFloat(v.replace('px', ''));
	return {
		canvasHeight: canvas ? px(canvas.style.height) : NaN,
		blockTop: block ? px(block.style.top) : null,
		blockHeight: block ? px(block.style.height) : null,
		label: labelEl ? labelEl.textContent : null,
	};
}

describe('日视图右栏（12:00–24:00）块定位与刻度对齐', () => {
	beforeAll(() => {
		installObsidianGlobals();
	});

	test('09:45–21:00 的块在右栏：top=0、height=450px（12:00→21:00 共 9 小时）', () => {
		const { container, root } = mountCanvas(12, 24);
		const r = readCanvas(container);

		// 画布高 = 12 小时 × HOUR_PX
		expect(r.canvasHeight).toBe(12 * HOUR_PX);

		// 块从窗口起点 12:00 开始
		expect(r.blockTop).toBe(0);
		// 高度必须是 9 小时 = 450px —— 这是用户报告「截止时间不匹配」的核心断言
		expect(r.blockHeight).toBe(9 * HOUR_PX);
		expect(r.blockHeight).toBe(450);

		// 块内时间标签也应显示真实裁剪后的区间
		expect(r.label).toBe('12:00 – 21:00');

		act(() => root.unmount());
		container.remove();
	});

	test('块下边缘位置 = (21:00 − 12:00) / 60 × HOUR_PX，正好落在 21:00 刻度', () => {
		const { container, root } = mountCanvas(12, 24);
		const r = readCanvas(container);

		const bottom = (r.blockTop ?? 0) + (r.blockHeight ?? 0);
		// 21:00 相对窗口起点 12:00 是 540 分钟 → 540/60*50 = 450px
		expect(bottom).toBe(450);
		// 反算回分钟，必须等于 21:00
		expect(Math.round((bottom / HOUR_PX) * 60) + 12 * 60).toBe(21 * 60);

		act(() => root.unmount());
		container.remove();
	});

	test('左栏（0:00–12:00）同块：top=487.5、height=112.5（09:45→12:00）', () => {
		const { container, root } = mountCanvas(0, 12);
		const r = readCanvas(container);

		expect(r.canvasHeight).toBe(12 * HOUR_PX);
		// 09:45 = 585 分钟 → 585/60*50 = 487.5px
		expect(r.blockTop).toBeCloseTo(487.5, 1);
		// 12:00 − 09:45 = 135 分钟 → 112.5px
		expect(r.blockHeight).toBeCloseTo(112.5, 1);
		expect(r.label).toBe('09:45 – 12:00');

		act(() => root.unmount());
		container.remove();
	});

	test('画布高度恒等于窗口时长，不被外层 flex 压缩（回归：曾因多包一层 column 容器被压扁）', () => {
		for (const [s, e] of [[0, 12], [12, 24]] as const) {
			const { container, root } = mountCanvas(s, e);
			const r = readCanvas(container);
			// 画布内联高度必须严格等于窗口时长对应像素
			expect(r.canvasHeight).toBe((e - s) * HOUR_PX);
			act(() => root.unmount());
			container.remove();
		}
	});
});

describe('DOM 结构契约：画布不得被额外的 flex 列容器包裹', () => {
	test('画布的直接父级是 __body（不是中间包装层）', () => {
		const { container, root } = mountCanvas(12, 24);
		const canvas = container.querySelector(`.${DayCanvasClasses.elements.canvas}`) as HTMLElement;
		expect(canvas.parentElement?.className).toContain(DayCanvasClasses.elements.body);
		act(() => root.unmount());
		container.remove();
	});

	test('根节点是 .gc-day-canvas，且灰字提示在 __body 之外', () => {
		const { container, root } = mountCanvas(12, 24);
		const rootEl = container.querySelector(`.${DayCanvasClasses.block}`) as HTMLElement;
		expect(rootEl).not.toBeNull();
		const body = rootEl.querySelector(`.${DayCanvasClasses.elements.body}`) as HTMLElement;
		const hint = rootEl.querySelector(`.${DayCanvasClasses.elements.hint}`) as HTMLElement;
		expect(hint).not.toBeNull();
		// 提示必须是 body 的兄弟节点，不能插在 body 与画布之间
		expect(body.contains(hint)).toBe(false);
		act(() => root.unmount());
		container.remove();
	});

	test('整天窗口（侧栏）不渲染分栏提示', () => {
		const { container, root } = mountCanvas(0, 24);
		const hint = container.querySelector(`.${DayCanvasClasses.elements.hint}`);
		expect(hint).toBeNull();
		act(() => root.unmount());
		container.remove();
	});
});
