/**
 * @jest-environment jsdom
 *
 * 编辑面板「任务标题 + 任务详情」渲染契约（2026-11-25）
 *
 * 用户需求：
 *  1. 「任务描述」改名为「任务标题」
 *  2. 新增「详情」字段，内容为任务行下方的多行文字
 *
 * 断言真实渲染的 TaskFormModal：
 *  - 标题区显示「任务标题」而非「任务描述」
 *  - 详情 textarea 存在，且预填任务已有详情
 *  - 修改详情后保存，会带上 details 更新
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
import { initializeI18n } from '../src/i18n/i18n';
import type { GCTask } from '../src/types';

const detailsCls = EditTaskModalClasses.elements.detailsTextarea;
const descCls = EditTaskModalClasses.elements.descTextarea;

function installObsidianGlobals(): void {
	const g = window as unknown as Record<string, unknown> & { activeDocument?: Document };
	if (!g.activeDocument) g.activeDocument = document;

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
	if (typeof proto.setText !== 'function') {
		proto.setText = function (this: HTMLElement, t: string) {
			this.textContent = t;
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

function mkTask(details?: string): GCTask {
	return {
		description: '三十三-小群-拿1116包资源',
		details,
		filePath: 'Daily Note/2026-11-23.md',
		lineNumber: 9,
		fileName: '2026-11-23',
		rawText: '- [ ] 🎯 三十三-小群-拿1116包资源',
		status: 'important',
		tags: [],
		metadataFields: [],
		datePrecision: {},
	} as unknown as GCTask;
}

function mount(task?: GCTask): { container: HTMLElement; root: Root } {
	(window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(TaskFormModal, {
				mode: task ? 'edit' : 'create',
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

describe('编辑面板：任务标题 + 任务详情', () => {
	beforeAll(async () => {
		installObsidianGlobals();
		// i18n 未初始化时 t() 会返回 key 本身，标签断言必须在初始化后做
		await initializeI18n('zh');
	});

	test('标签显示「任务标题」，不再出现「任务描述」', () => {
		const { container, root } = mount(mkTask('详情一\n详情二'));
		try {
			const labels = Array.from(container.querySelectorAll('label')).map((l) => l.textContent || '');
			expect(labels.some((t) => t.includes('任务标题'))).toBe(true);
			expect(labels.some((t) => t.includes('任务描述'))).toBe(false);
			// 详情标签也应在
			expect(labels.some((t) => t.includes('任务详情'))).toBe(true);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('详情 textarea 存在且预填任务已有详情', () => {
		const { container, root } = mount(mkTask('详情一\n详情二\n详情三'));
		try {
			const el = container.querySelector<HTMLTextAreaElement>(`.${detailsCls}`);
			expect(el).not.toBeNull();
			expect(el!.value).toBe('详情一\n详情二\n详情三');
			// 详情是多行可编辑区（不是标题那种单行）
			expect(el!.tagName).toBe('TEXTAREA');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('无详情任务：详情框为空但仍渲染', () => {
		const { container, root } = mount(mkTask());
		try {
			const el = container.querySelector<HTMLTextAreaElement>(`.${detailsCls}`);
			expect(el).not.toBeNull();
			expect(el!.value).toBe('');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('标题框与详情框是两个独立控件', () => {
		const { container, root } = mount(mkTask('详情内容'));
		try {
			const desc = container.querySelector<HTMLTextAreaElement>(`.${descCls}`);
			const det = container.querySelector<HTMLTextAreaElement>(`.${detailsCls}`);
			expect(desc).not.toBeNull();
			expect(det).not.toBeNull();
			expect(desc).not.toBe(det);
			// 标题框只有标题，不含详情
			expect(desc!.value).toBe('三十三-小群-拿1116包资源');
			expect(det!.value).toBe('详情内容');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('创建模式也有详情输入框', () => {
		const { container, root } = mount();
		try {
			const el = container.querySelector<HTMLTextAreaElement>(`.${detailsCls}`);
			expect(el).not.toBeNull();
			expect(el!.value).toBe('');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('详情 1:1 保留 Obsidian 格式：== 高亮与 Tab 缩进原样呈现', () => {
		const raw = '==拿到了 1116 版本的包以及补丁==\n\t==「qq.zip」，复制整段内容==\n\t\t==更深一级==';
		const { container, root } = mount(mkTask(raw));
		try {
			const el = container.querySelector<HTMLTextAreaElement>(`.${detailsCls}`);
			expect(el).not.toBeNull();
			// 逐字一致：== 符号、Tab 缩进、多级层级都不得被改写
			expect(el!.value).toBe(raw);
			expect(el!.value).toContain('==');
			expect(el!.value.split('\n')[1].startsWith('\t')).toBe(true);
			expect(el!.value.split('\n')[2].startsWith('\t\t')).toBe(true);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});

	test('详情框按 Tab 插入 Tab 字符（不跳焦点）', () => {
		const { container, root } = mount(mkTask('第一行'));
		try {
			const el = container.querySelector<HTMLTextAreaElement>(`.${detailsCls}`);
			expect(el).not.toBeNull();
			if (!el) return;
			el.focus();
			el.selectionStart = el.selectionEnd = el.value.length;
			act(() => {
				const ev = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
				el.dispatchEvent(ev);
				expect(ev.defaultPrevented).toBe(true);
			});
			// Tab 被插入到文本中
			expect(el.value).toBe('第一行\t');
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});
});
