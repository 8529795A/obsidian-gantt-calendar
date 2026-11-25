/**
 * @jest-environment jsdom
 *
 * 编辑面板「任务状态」单选交互契约（2026-11-23）
 *
 * 用户反馈三点：
 *  1. 点击选择后没有明显的选中可视化
 *  2. 选择后无法取消，希望再点一次即可取消
 *  3. 「已取消」的灰色改为原「已完成」的绿色（颜色断言在 taskStatus.test.ts）
 *
 * 本测试直接渲染真实 TaskFormModal，断言：
 *  - 当前状态对应按钮带 `--selected` 修饰符且渲染对勾
 *  - 未选中按钮不带修饰符、无对勾
 *  - 再点已选中按钮 → 取消选择（无任何按钮被选中）
 *  - 点其它按钮 → 只该按钮被选中（单选）
 *  - 创建模式默认无选中
 *
 * 说明：Modal 用非 portal 直通替身，避免 jsdom 下 portal 事件委托与 motion 的干扰，
 * 使断言聚焦在状态选择逻辑本身；视觉样式由 edit-task-modal.css 提供。
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('../src/ui/components/Modal', () => ({
	Modal: ({ open, children }: { open: boolean; children: unknown }) =>
		open ? createElement('div', { className: 'test-modal-shell' }, children as never) : null,
}));

import { TaskFormModal } from '../src/ui/modals/TaskFormModal';
import { DEFAULT_TASK_STATUSES } from '../src/tasks/taskStatus';
import { EditTaskModalClasses } from '../src/utils/bem';
import type { GCTask } from '../src/types';

const selectedClass = EditTaskModalClasses.elements.statusBtnSelected; // gc-...__status-btn--selected
const checkClass = EditTaskModalClasses.elements.statusBtnCheck;       // gc-...__status-btn-check

function installObsidianGlobals(): void {
	const g = window as unknown as Record<string, unknown> & { activeDocument?: Document };
	if (!g.activeDocument) g.activeDocument = document;

	// Obsidian 全局 DOM 构造助手（DateTimePicker 等基础组件会直接调用）
	const mkEl = (tag: string, opts?: unknown): HTMLElement => {
		const el = document.createElement(tag);
		if (typeof opts === 'string') {
			el.className = opts;
		} else if (opts && typeof opts === 'object') {
			const o = opts as { cls?: string; text?: string; attr?: Record<string, string> };
			if (o.cls) el.className = o.cls;
			if (o.text) el.textContent = o.text;
			if (o.attr) for (const k of Object.keys(o.attr)) el.setAttribute(k, o.attr[k]);
		}
		return el;
	};
	if (typeof g.createDiv !== 'function') g.createDiv = (o?: unknown) => mkEl('div', o);
	if (typeof g.createSpan !== 'function') g.createSpan = (o?: unknown) => mkEl('span', o);
	if (typeof g.createEl !== 'function') g.createEl = (tag: string, o?: unknown) => mkEl(tag, o);

	const proto = HTMLElement.prototype as unknown as Record<string, unknown> & {
		hasClass?: (this: HTMLElement, cls: string) => boolean;
	};
	if (!proto.hasClass) {
		proto.hasClass = function hasClass(this: HTMLElement, cls: string) {
			return this.classList.contains(cls);
		};
	}
	if (typeof proto.createEl !== 'function') {
		proto.createEl = function (this: HTMLElement, tag: string, o?: unknown) {
			const el = mkEl(tag, o);
			this.appendChild(el);
			return el;
		};
	}
	if (typeof proto.createDiv !== 'function') {
		proto.createDiv = function (this: HTMLElement, o?: unknown) {
			const el = mkEl('div', o);
			this.appendChild(el);
			return el;
		};
	}
	if (typeof proto.createSpan !== 'function') {
		proto.createSpan = function (this: HTMLElement, o?: unknown) {
			const el = mkEl('span', o);
			this.appendChild(el);
			return el;
		};
	}
	if (typeof proto.setText !== 'function') {
		proto.setText = function (this: HTMLElement, t: string) {
			this.textContent = t;
		};
	}
	if (typeof proto.empty !== 'function') {
		proto.empty = function (this: HTMLElement) {
			while (this.firstChild) this.removeChild(this.firstChild);
		};
	}

	if (typeof window.requestAnimationFrame !== 'function') {
		(window as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame =
			(cb: () => void) => setTimeout(cb, 0) as unknown as number;
	}
}

const plugin = {
	app: {
		vault: { getAbstractFileByPath: () => null },
		workspace: { getLeaf: () => null },
		plugins: { plugins: {} },
	},
	settings: {
		taskStatuses: DEFAULT_TASK_STATUSES,
		defaultTaskPriority: 'normal',
		enabledTaskFormats: ['tasks'],
		taskNotePath: 'Tasks',
		globalTaskFilter: '',
		showGlobalFilterInTaskText: false,
		recurringTaskDisplayLimit: 5,
	},
	taskCache: { getAllTasks: () => [] },
} as unknown as Parameters<typeof TaskFormModal>[0]['plugin'];

function mkTask(status: string): GCTask {
	return {
		description: '联动任务',
		filePath: 'x.md',
		lineNumber: 1,
		fileName: 'x',
		rawText: '- [/] 联动任务',
		status,
		tags: [],
		metadataFields: [],
		datePrecision: {},
	} as unknown as GCTask;
}

function mount(mode: 'create' | 'edit', task?: GCTask): { container: HTMLElement; root: Root } {
	(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(TaskFormModal, {
				mode,
				app: plugin!.app,
				plugin,
				task,
				enabledFormats: ['tasks'],
				allowEditContent: true,
				onSuccess: () => {},
				onClose: () => {},
			}),
		);
	});
	return { container, root };
}

function btn(container: HTMLElement, key: string): HTMLButtonElement | null {
	return container.querySelector<HTMLButtonElement>(`[data-status="${key}"]`);
}

function selectedKeys(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll<HTMLElement>(`.${selectedClass}`)).map(
		(el) => el.dataset.status || '',
	);
}

function click(el: Element | null): void {
	act(() => {
		el!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
	});
}

describe('编辑面板任务状态：明显选中 + 再次点击可取消', () => {
	beforeAll(() => {
		installObsidianGlobals();
	});

	test('编辑模式：当前状态（in_progress）按钮带 --selected 与对勾，其它不带', () => {
		const { container, root } = mount('edit', mkTask('in_progress'));
		try {
			const inProg = btn(container, 'in_progress');
			expect(inProg).not.toBeNull();
			expect(inProg!.className).toContain(selectedClass);
			expect(inProg!.getAttribute('aria-pressed')).toBe('true');
			expect(inProg!.querySelector(`.${checkClass}`)).not.toBeNull();

			const important = btn(container, 'important');
			expect(important!.className).not.toContain(selectedClass);
			expect(important!.getAttribute('aria-pressed')).toBe('false');
			expect(important!.querySelector(`.${checkClass}`)).toBeNull();

			expect(selectedKeys(container)).toEqual(['in_progress']);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('再次点击已选中状态 → 取消选择（无任何按钮被选中）', () => {
		const { container, root } = mount('edit', mkTask('in_progress'));
		try {
			expect(selectedKeys(container)).toEqual(['in_progress']);
			click(btn(container, 'in_progress'));
			expect(selectedKeys(container)).toEqual([]);
			expect(container.querySelector(`.${checkClass}`)).toBeNull();
			expect(btn(container, 'in_progress')!.getAttribute('aria-pressed')).toBe('false');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('点击其它状态 → 单选切换（只有该状态被选中）', () => {
		const { container, root } = mount('edit', mkTask('in_progress'));
		try {
			click(btn(container, 'important'));
			expect(selectedKeys(container)).toEqual(['important']);
			expect(btn(container, 'important')!.querySelector(`.${checkClass}`)).not.toBeNull();
			expect(btn(container, 'in_progress')!.className).not.toContain(selectedClass);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('取消后可重新选择：选中→取消→选另一个', () => {
		const { container, root } = mount('edit', mkTask('in_progress'));
		try {
			click(btn(container, 'in_progress'));        // 取消
			expect(selectedKeys(container)).toEqual([]);
			click(btn(container, 'question'));           // 选另一个
			expect(selectedKeys(container)).toEqual(['question']);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('创建模式默认无任何状态被选中', () => {
		const { container, root } = mount('create');
		try {
			expect(selectedKeys(container)).toEqual([]);
			expect(container.querySelectorAll(`.${checkClass}`)).toHaveLength(0);
			// 但 5 个状态按钮都在
			expect(container.querySelectorAll('[data-status]')).toHaveLength(DEFAULT_TASK_STATUSES.length);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});
});
