import { Plugin, Notice } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GCSidebarView, GC_SIDEBAR_VIEW_ID } from './src/GCSidebarView';
import { GanttCalendarSettingTab } from './src/settings';
import type { GanttCalendarSettings } from './src/settings/types';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';
import { setTimezoneOffset } from './src/dateUtils/timezone';
import { initializeI18n, setLanguage, isChineseLanguage } from './src/i18n/i18n';
import { refreshPresetStatusNames } from './src/tasks/taskStatus';

import { SettingsManager } from './src/managers/SettingsManager';
import { ThemeManager } from './src/managers/ThemeManager';
import { ViewManager, activateSidebarView } from './src/managers/ViewManager';
import { DailyNoteIndex } from './src/utils/dailyNoteSettingsBridge';
import { initModalHost, destroyModalHost } from './src/ui/modals/modalHost';
import { useCalendarStore } from './src/ui/store/calendarStore';

/** 视图筛选变更写回 data.json 的防抖间隔（点击级频率，无需即时时效） */
const VIEW_FILTERS_SAVE_DEBOUNCE_MS = 800;

/**
 * 构建戳：每次构建由 esbuild 注入当前时间，用于确认运行中的插件版本。
 * 右键菜单状态段改为动态生成后加入，便于排查"改了但没生效"。
 */
const BUILD_STAMP = '2026-11-22-canvas-tint-2day-wheel';

export default class GanttCalendarPlugin extends Plugin {
	settings: GanttCalendarSettings;
	taskCache: TaskStore;
	/** taskCache 初始化延迟句柄，onunload 时取消 */
	private initTimeout: number | null = null;
	/** store 订阅退订句柄，onunload 时取消 */
	private viewFiltersUnsubscribe: (() => void) | null = null;
	/** 视图筛选写回防抖句柄，onunload 时冲刷 */
	private viewFiltersSaveTimer: number | null = null;
	dailyNoteIndex: DailyNoteIndex;

	private settingsManager: SettingsManager;
	private themeManager: ThemeManager;
	private viewManager: ViewManager;

	async onload() {
		// 构建标识：用于确认 Obsidian 当前加载的是哪一版代码。
		// 改动后若控制台仍显示旧标识，说明插件未被重新加载（需要重载应用）。
		Logger.info('GanttCalendar', `onload build=${BUILD_STAMP} statusMenu=dynamic`);

		await initializeI18n();

		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.loadSettings();

		// 视图筛选偏好：从 data.json 水合进 store（先水合后订阅，
		// 避免水合触发的首次 set 被当成变更写回）；
		// 后续筛选变更经订阅防抖写回 data.json
		useCalendarStore.getState().hydrateViewFilters(this.settings.viewFilters);
		this.viewFiltersUnsubscribe = useCalendarStore.subscribe((state, prev) => {
			if (state.viewFilters === prev.viewFilters) return;
			this.settings.viewFilters = state.viewFilters;
			this.scheduleViewFiltersSave();
		});

		// 应用用户设置的语言（覆盖系统检测）
		if (this.settings.language && this.settings.language !== 'system') {
			setLanguage(this.settings.language);
		}
		// 刷新预设状态名称以匹配当前语言
		refreshPresetStatusNames(this.settings.taskStatuses);
		// 英文模式下自动关闭农历显示
		this.settings.showLunar = isChineseLanguage();

		Logger.init(this);
		setTimezoneOffset(this.settings.timezoneOffset);

		this.taskCache = new TaskStore(this.app);
		this.scheduleTaskCacheInit();

		this.dailyNoteIndex = new DailyNoteIndex(this.app);
		this.dailyNoteIndex.initialize();

		this.viewManager = new ViewManager(this.app);

		this.themeManager = new ThemeManager();
		this.themeManager.initialize(() => this.viewManager?.refreshAllViews());

		this.registerView(GC_VIEW_ID, (leaf) => new GCMainView(leaf, this));
		this.registerView(GC_SIDEBAR_VIEW_ID, (leaf) => new GCSidebarView(leaf, this));

		this.registerUIElements();

		registerAllCommands(this);

		this.addSettingTab(new GanttCalendarSettingTab(this.app, this));

		// 全局 React Modal 宿主（设置面板等非 React 环境也需打开 React 模态框）
		initModalHost();

		// 启动时自动打开侧边栏
		this.app.workspace.onLayoutReady(() => {
			void activateSidebarView(this.app);
		});
	}

	onunload() {
		// 取消尚未触发的初始化，防止卸载后对已销毁对象调用 initialize
		if (this.initTimeout !== null) {
			window.clearTimeout(this.initTimeout);
			this.initTimeout = null;
		}
		// 退订筛选 store，冲刷未落盘的筛选变更
		if (this.viewFiltersUnsubscribe) {
			this.viewFiltersUnsubscribe();
			this.viewFiltersUnsubscribe = null;
		}
		if (this.viewFiltersSaveTimer !== null) {
			window.clearTimeout(this.viewFiltersSaveTimer);
			this.viewFiltersSaveTimer = null;
			void this.settingsManager.saveSettings(this.settings);
		}
		this.dailyNoteIndex?.destroy();
		this.themeManager?.destroy();
		this.taskCache?.clear();
		TooltipManager.reset();
		destroyModalHost();
		this.app.workspace.getLeavesOfType(GC_VIEW_ID).forEach(leaf => leaf.detach());
		this.app.workspace.getLeavesOfType(GC_SIDEBAR_VIEW_ID).forEach(leaf => leaf.detach());
	}

	// ===== 公共方法 =====

	async saveSettings(): Promise<void> {
		await this.settingsManager.saveSettings(this.settings);
		if (this.taskCache) {
			await this.taskCache.updateSettings(
				this.settings.globalTaskFilter,
				this.settings.enabledTaskFormats
			);
		}
	}

	async activateView(): Promise<void> {
		return this.viewManager.activateView();
	}

	/**
	 * 视图筛选变更防抖写回 data.json（只走 SettingsManager.saveData 落盘，
	 * 不经 saveSettings 的 taskCache 重配置副作用）
	 */
	private scheduleViewFiltersSave(): void {
		if (this.viewFiltersSaveTimer !== null) {
			window.clearTimeout(this.viewFiltersSaveTimer);
		}
		this.viewFiltersSaveTimer = window.setTimeout(() => {
			this.viewFiltersSaveTimer = null;
			void this.settingsManager.saveSettings(this.settings);
		}, VIEW_FILTERS_SAVE_DEBOUNCE_MS);
	}

	refreshCalendarViews(): void {
		this.viewManager.refreshAllViews();
	}

	// ===== 私有方法 =====

	private scheduleTaskCacheInit(): void {
		// onLayoutReady 即 vault/metadataCache 就绪信号，无需额外固定延迟。
		// 视图通过 taskCache.whenReady() 等待扫描完成（取代此前的 800ms
		// 魔法延迟 + 空首屏等待事件回流的做法）。
		// initTimeout 保存句柄：插件卸载时取消，防止对已销毁对象调用 initialize
		this.app.workspace.onLayoutReady(() => {
			this.initTimeout = window.setTimeout(() => {
				this.initTimeout = null;
				this.taskCache.initialize(
					this.settings.globalTaskFilter,
					this.settings.enabledTaskFormats
				).then(async () => {
					Logger.stats('Main', 'Task cache initialized');
					// P1：此处不再 refreshCalendarViews()——数据推送已由
					// TaskStore.notifyListeners()（onUpdate）与视图 whenReady 订阅
					// 承担；旧实现经 bumpSettings()++settingsVersion 触发
					// AnimatePresence 整视图卸载重挂，数据刚填充即闪烁重排。
				}).catch(error => {
					Logger.error('Main', 'Failed to initialize task cache:', error);
					new Notice('任务缓存初始化失败');
				});
			}, 0);
		});
	}

	private registerUIElements(): void {
		const ribbonIconEl = this.addRibbonIcon('goal', '\u7518\u7279\u65E5\u5386', () => {
			void this.activateView();
		});
		ribbonIconEl.addClass('gantt-calendar-ribbon');
	}
}
