/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DayView } from '../src/ui/views/DayView';
import { PluginContext } from '../src/ui/pluginContext';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { DayViewClasses } from '../src/utils/bem';
import { Platform } from 'obsidian';
import type { IPluginContext } from '../src/types';

const plugin = {
	app: {
		workspace: {
			rootSplit: {},
		},
		vault: {
			getAbstractFileByPath: () => null,
		},
	},
	settings: {
		enableDailyNote: true,
		dayViewLayout: 'horizontal',
		startOnMonday: false,
		taskStatuses: [],
	},
	dailyNoteIndex: {},
	saveSettings: async () => {},
	refreshCalendarViews: () => {},
	taskCache: {
		getAllTasks: () => [],
		refreshFile: async () => {},
	},
} as unknown as IPluginContext;

function installMatchMedia(matches: boolean): void {
	window.matchMedia = (query: string) => ({
		matches: query === '(max-width: 520px)' ? matches : false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

function installObsidianElementExtensions(): void {
	const proto = HTMLElement.prototype as unknown as {
		empty: (this: HTMLElement) => void;
		createDiv: (this: HTMLElement, options?: { text?: string; cls?: string }) => HTMLDivElement;
	};
	proto.empty = function empty(this: HTMLElement) {
		this.replaceChildren();
	};
	proto.createDiv = function createDiv(this: HTMLElement, options?: { text?: string; cls?: string }) {
		const child = document.createElement('div');
		if (options?.cls) child.className = options.cls;
		if (options?.text) child.textContent = options.text;
		this.appendChild(child);
		return child;
	};
}

/**
 * 日视图布局契约（2026-11-22 改版）：
 * 日视图固定为「左 00:00–12:00 / 右 12:00–24:00」双时间窗，
 * 不再嵌入 Daily Note，也不再随窗口宽度切换左右/上下分屏。
 */
describe('DayView dual time-window layout', () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeAll(() => {
		installObsidianElementExtensions();
	});

	beforeEach(() => {
		(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		useCalendarStore.setState({ viewType: 'day', tasks: [], tasksReady: true });
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
		Platform.isPhone = false;
	});

	test('renders two canvas panes split by a divider (left 0-12 / right 12-24)', async () => {
		installMatchMedia(false);

		await act(async () => {
			root.render(createElement(PluginContext.Provider, { value: plugin }, createElement(DayView)));
		});

		// 双时间窗容器存在
		expect(container.getElementsByClassName(DayViewClasses.elements.splitCanvas).length).toBe(1);
		// 两个画布分栏
		expect(container.getElementsByClassName(DayViewClasses.elements.canvasPane).length).toBe(2);
		// 中间一条分割线
		expect(container.getElementsByClassName(DayViewClasses.elements.canvasDivider).length).toBe(1);
	});

	test('no longer embeds the Daily Note pane', async () => {
		installMatchMedia(false);

		await act(async () => {
			root.render(createElement(PluginContext.Provider, { value: plugin }, createElement(DayView)));
		});

		// 旧的笔记区/分屏修饰符已退场
		expect(container.getElementsByClassName(DayViewClasses.elements.sectionNotes).length).toBe(0);
		expect(container.getElementsByClassName(DayViewClasses.modifiers.horizontal).length).toBe(0);
		expect(container.getElementsByClassName(DayViewClasses.modifiers.vertical).length).toBe(0);
		// 固定走 tasks-only 布局
		expect(container.getElementsByClassName(DayViewClasses.modifiers.tasksOnly).length).toBe(1);
	});

	test('layout stays identical on narrow windows (no vertical/horizontal switch)', async () => {
		installMatchMedia(true);

		await act(async () => {
			root.render(createElement(PluginContext.Provider, { value: plugin }, createElement(DayView)));
		});

		// 窄屏仍渲染两个分栏，堆叠交给 CSS media query，不再切换 DOM 结构
		expect(container.getElementsByClassName(DayViewClasses.elements.canvasPane).length).toBe(2);
		expect(container.getElementsByClassName(DayViewClasses.modifiers.vertical).length).toBe(0);
		expect(container.getElementsByClassName(DayViewClasses.modifiers.horizontal).length).toBe(0);
	});
});
