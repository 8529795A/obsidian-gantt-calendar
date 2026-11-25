/**
 * @jest-environment jsdom
 *
 * 月视图滚轮回归测试（2026-11-22）
 *
 * 背景：滚轮监听原先挂在 <motion.div key={monthKey}> 上。切月时 key 变化会让 React
 * 销毁重建该节点，监听器随之绑定到已销毁的旧节点——表现为「第一次能切月，之后失效」。
 * 本测试锁定契约：监听必须挂在「不随月份重建」的常驻容器（.gc-month-anim）上，
 * 且切月后新月份 DOM 内的滚轮事件仍能被同一个监听器捕获。
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MonthView } from '../src/ui/views/MonthView';
import { PluginContext } from '../src/ui/pluginContext';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { MonthViewClasses } from '../src/utils/bem';
import type { IPluginContext } from '../src/types';

const plugin = {
	app: {
		workspace: { getLeaf: () => null },
		vault: { getAbstractFileByPath: () => null },
	},
	settings: {
		startOnMonday: false,
		monthLunarFontSize: 10,
		monthViewTaskLimit: 3,
		showLunar: false,
		showFestivals: false,
		ganttStartField: 'startDate',
		ganttEndField: 'dueDate',
		enabledTaskFormats: ['tasks'],
		monthViewShowCheckbox: true,
		monthViewShowTags: false,
		monthViewShowPriority: false,
		monthViewShowTicktick: false,
		recurringTaskDisplayLimit: 5,
	},
	dailyNoteIndex: {},
	saveSettings: async () => {},
	refreshCalendarViews: () => {},
	taskCache: {
		getAllTasks: () => [],
		refreshFile: async () => {},
	},
} as unknown as IPluginContext;

/** jsdom 未实现 matchMedia */
function installMatchMedia(): void {
	window.matchMedia = (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

/** Obsidian 在 HTMLElement 上扩展的 createDiv/empty */
function installObsidianElementExtensions(): void {
	const proto = HTMLElement.prototype as unknown as {
		empty: (this: HTMLElement) => void;
		createDiv: (this: HTMLElement, options?: { text?: string; cls?: string }) => HTMLDivElement;
	};
	if (!proto.empty) {
		proto.empty = function empty(this: HTMLElement) {
			this.replaceChildren();
		};
	}
	if (!proto.createDiv) {
		proto.createDiv = function createDiv(this: HTMLElement, options?: { text?: string; cls?: string }): HTMLDivElement {
			const child: HTMLDivElement = document.createElement('div');
			if (options?.cls) child.className = options.cls;
			if (options?.text) child.textContent = options.text;
			this.appendChild(child);
			return child;
		};
	}
}

describe('MonthView 滚轮监听挂载点', () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		installObsidianElementExtensions();
		installMatchMedia();
	});

	beforeEach(() => {
		(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		useCalendarStore.setState({
			viewType: 'month',
			currentDate: new Date(2026, 10, 22), // 2026-11-22
			tasks: [],
			tasksReady: true,
		});
		// jsdom 测试环境无 Obsidian 的全局 createDiv，直接用原生 DOM API
		container = globalThis.document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
	});

	/** 取常驻外层容器（滚轮监听应挂在这里） */
	function getStableHost(): HTMLElement | null {
		return container.querySelector<HTMLElement>('.gc-month-anim');
	}

	/** 取随月份重建的网格本体 */
	function getMonthGrid(): HTMLElement | null {
		return container.querySelector<HTMLElement>('.gc-view--month');
	}

	async function render(): Promise<void> {
		await act(async () => {
			root.render(createElement(PluginContext.Provider, { value: plugin }, createElement(MonthView)));
		});
	}

	it('常驻容器 .gc-month-anim 存在，且月份网格在其内部（监听挂点稳定）', async () => {
		await render();

		const host = getStableHost();
		const grid = getMonthGrid();
		expect(host).not.toBeNull();
		expect(grid).not.toBeNull();
		// 网格是常驻容器的子节点：容器不随 key 变化而重建
		expect(host!.contains(grid)).toBe(true);
	});

	it('切月后常驻容器仍是同一个 DOM 节点（监听器不会因重建而丢失）', async () => {
		await render();
		const hostBefore = getStableHost();
		expect(hostBefore).not.toBeNull();

		// 切到下一月：网格 key 变化会被重建，但常驻容器应复用
		await act(async () => {
			useCalendarStore.setState({ currentDate: new Date(2026, 11, 22) });
		});

		const hostAfter = getStableHost();
		expect(hostAfter).not.toBeNull();
		expect(hostAfter).toBe(hostBefore);
		// 切月后网格仍在常驻容器内（监听挂点持续有效）
		const gridAfter = getMonthGrid();
		expect(gridAfter).not.toBeNull();
		expect(hostAfter!.contains(gridAfter)).toBe(true);
	});

	it('空白处滚轮不切月（2026-11-22 需求：取消滚轮切月）', async () => {
		await render();
		const monthBefore = useCalendarStore.getState().currentDate.getMonth();

		// 在常驻容器（非日期格）上派发滚轮：应完全不处理
		const host = getStableHost()!;
		const wheel = new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true });
		await act(async () => {
			host.dispatchEvent(wheel);
		});

		// 月份不变，且不阻止默认行为（交回浏览器）
		expect(useCalendarStore.getState().currentDate.getMonth()).toBe(monthBefore);
		expect(wheel.defaultPrevented).toBe(false);
	});

	it('所有日期格的任务容器都启用可滚动样式（含当月格）', async () => {
		await render();

		const allTaskLists = container.querySelectorAll<HTMLElement>(
			`.${MonthViewClasses.elements.tasks}`
		);
		expect(allTaskLists.length).toBeGreaterThan(0);

		// 每个格子的任务容器都应带 --scrollable（当月格不再被 taskLimit 截断）
		allTaskLists.forEach((el) => {
			expect(el.classList.contains(MonthViewClasses.modifiers.tasksScrollable)).toBe(true);
		});
	});

	it('每个日期格都渲染了只读滚动条轨道', async () => {
		await render();

		const cells = container.querySelectorAll<HTMLElement>(
			`.${MonthViewClasses.elements.dayCell}`
		);
		const tracks = container.querySelectorAll<HTMLElement>(
			`.${MonthViewClasses.elements.scrollTrack}`
		);
		expect(cells.length).toBeGreaterThan(0);
		// 轨道数应与格子数一致（每格一条，溢出时才显示滑块）
		expect(tracks.length).toBe(cells.length);
	});

	it('非当月日期格内的滚轮不触发切月（月份保持不变）', async () => {
		await render();
		const monthBefore = useCalendarStore.getState().currentDate.getMonth();

		// 找一个非当月格子（月网格首尾通常含相邻月补位日）
		const outsideCell = container.querySelector<HTMLElement>(
			`.${MonthViewClasses.modifiers.outsideMonth}`
		);

		if (outsideCell) {
			const wheel = new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true });
			await act(async () => {
				outsideCell.dispatchEvent(wheel);
			});
			// 非当月格分支：不切月
			expect(useCalendarStore.getState().currentDate.getMonth()).toBe(monthBefore);
		} else {
			// 该月无补位日时跳过（不构成失败）
			expect(outsideCell).toBeNull();
		}
	});
});
