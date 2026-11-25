# CLAUDE.md

本文件为 Claude Code 在此代码库中工作时提供指导。

## 构建

```bash
npm run dev          # esbuild watch 模式
npm run build        # tsc 类型检查 + esbuild 生产打包 + 同步到 example vault
```

构建产物为 `main.js`（单文件 CJS bundle，外部依赖 `obsidian`、`electron`）。

**测试**：`tests/` 与 `src/**/__tests__/` 共 48 个 suite、558 个用例，直接 `npx jest` 运行。
Windows 下需加 `--runInBand`（jest worker 与 esbuild 一样会因沙箱限制 `spawn EPERM`）。

## 架构

### UI 层（React，自阶段0-5重构完成）

- `main.ts` 注册 2 个 Obsidian ItemView：`GCMainView`（主日历视图）和 `GCSidebarView`（右侧栏），均为 React 挂载壳
- `src/ui/App.tsx` 挂载 `ModalProvider` + `TooltipProvider` 包裹 6 个视图：`YearView`、`MonthView`、`WeekView`、`DayView`、`TaskView`、`GanttView`
- `src/ui/sidebar/` — `SidebarApp`（Tab 壳）+ `TaskListPanel` + `DailyTimelinePanel`
- `src/ui/components/` — 基础组件（Icon/DropdownMenu/Modal/TooltipProvider/ContextMenu/TaskCard/Toolbar）
- `src/ui/modals/` — 模态框：`TaskFormModal`（创建/编辑双模式）、`ConfirmDialog`；`modalHost.ts` 为插件级全局 React 宿主，提供 `openReactModal()` 命令式桥接，供设置面板等非 React 环境打开 React 模态框
- 甘特图与设置面板不 React 化（决策保留）：SVG 引擎 `src/gantt/wrappers/svgGanttRenderer.ts`，设置面板 `src/settings/` 为命令式 Builder 模式
- 数据状态经 `src/ui/store/calendarStore.ts`（zustand）与插件上下文 `src/ui/pluginContext.tsx`

### 数据层（分层架构）

```
TaskStore（门面，供视图使用）
  ├── EventBus（发布-订阅事件系统）
  └── TaskRepository（仓库模式，内存 Map 缓存 + 文件索引）
      └── MarkdownDataSource（扫描 vault 文件，50 个一批，metadataCache 解析）
```

- `TaskStore.getAllTasks()` 返回缓存结果，缓存通过防抖（75ms）失效
- `MarkdownDataSource` 文件修改事件防抖 50ms，处理 create/modify/delete/rename
- 任务解析采用四步流水线：`step1` 正则匹配 → `step2` 全局筛选符 → `step3` 格式检测 → `step4` 属性解析
- 变更检测采用指纹字段级 diff：L3 缓存（`MarkdownFileCache.taskFingerprints`）逐任务比对轻量指纹，未变化的任务不发事件（避免大文件编辑的事件风暴）

**已知优化空间——任务身份跟行号走**：任务 ID 均为 `路径:行号` 制（数据层 `filePath:lineNumber`，甘特层 `文件名-行号-路径哈希`），内容指纹只用于变更检测、不参与身份判定。插入/删除行会导致下方任务 ID 集体漂移（diff 走"错位继承"保证内容正确，但甘特增量更新可能误判为大量新增+删除而升级全量重绘）。如后续遇到"插入行导致甘特图闪重绘/身份重排"类问题，优化方向是 ID 掺入内容短哈希（`文件名-行号-内容哈希`），diff 改为内容哈希匹配优先、行号兜底；涉及数据层 diff、甘特 diff、删除占位三处配套改造。当前为有意保持的现状（2026-08 决策），非缺陷。

### 任务状态（2026-11-23 重构后）

任务状态已降级为**纯颜色标签**，只决定卡片/块底色，不含完成/取消语义：

- `src/tasks/taskStatus.ts` — 状态定义与符号映射。`DEFAULT_TASK_STATUSES` 为 5 个纯颜色状态
  （重要 `!` / 已取消 `-` / 进行中 `/` / 有疑问 `?` / 已开始 `n`），同时充当设置缺失时的兜底默认值
- 状态 key ↔ 复选框符号（`[ ]` 内的单字符）一一映射；`[ ]`（空格）表示**无状态**，
  `parseStatusFromCheckbox(' ')` 返回**空字符串**而非某个具体状态
- **没有** `completed` / `cancelled` 字段，也**没有**「完成日期 / 取消日期」字段；
  卡片不渲染复选框，甘特图不渲染进度条
- 状态全部平等：无 `isDefault` 保护，设置界面里可自由增删改
- `SettingsManager.migrateRemoveCompletionStatuses()` 在加载时剔除历史遗留的 `todo`/`done`

### 已移除的子系统

以下能力已于 2026-11-23 整体移除（相关源码目录已删除，勿在文档/代码中引用）：

- **同步系统**：飞书双向同步、CalDAV（Google/Apple/Outlook）、API 数据源、`SyncManager`、
  `SyncManagerBridge`、同步设置 Tab、工具栏同步按钮、`.feishu-sync-state.json`
- **状态栏**：Obsidian 窗口底部的任务计数与同步状态（其数据源随上两项一并消失）
- **完成/取消语义**：`updateTaskCompletion`、`cancelTask`、`restoreTask`、重复任务「完成并生成下一次」

### 已移除：优先级（2026-11-25）

优先级功能已**整体删除**，不是隐藏。`GCTask` 无 `priority` 字段，全链路不再读写：

- **类型**：`GCTask.priority`、`SortField` 的 `'priority'`、`MergeableTaskField` 的 `'priority'`、
  `data-layer/types` 的 `Priority`、`gantt/types` 的 `*PriorityColor` 均已删除
- **解析**：`step4` 不再导出 `parseTasksPriority` / `parseDataviewPriority`；
  `taskSerializerSymbols` 不再有 `PriorityLevel`、`prioritySymbols`、`priorityRegex`、
  `parsePriorityFrom*` / `priorityLevelTo*`；`taskParser/utils` 删除 `hasValidPriority`
- **序列化**：不再写回优先级 emoji（🔺⏫🔼🔽⏬）与 `[priority:: x]`；`TaskUpdates.priority` 已移除
- **排序**：`taskSorter` 删除 `PRIORITY_WEIGHTS` 与 priority 比较器，`SORT_OPTIONS` 剩 5 项
- **UI**：编辑面板无优先级板块；`TaskCard` 无优先级徽标；右键菜单无优先级段
  （`contextMenu/commands/setPriority.ts` 已删除）；侧栏无优先级筛选/排序；工具栏排序菜单无该项；
  tooltip 不显示优先级；甘特图条统一用 `--interactive-accent`，不再按优先级着色
- **设置**：`defaultTaskPriority`、`*ShowPriority`（5 个视图）与设置面板的优先级 chip 全部移除
- **保留的清理型正则**：`removePriorityEmoji` 与 `KNOWN_DV_FIELDS` 里的 `priority`
  仍保留——它们负责从**旧笔记文本**中剥离/保留历史优先级标记，属数据兼容层，勿删
- 新建任务不再写入优先级；旧笔记里的 `⏫` 会在下次写回时被清理，日期/标签/描述无损

### 任务详情（2026-11-25）

任务行**下方**属于该列表项的多行内容（惰性续行 + 子列表）即「详情」，存在 `GCTask.details`：

- `src/tasks/taskDetails.ts` 是唯一实现，解析与写回共用同一套边界/缩进规则：
  - `findDetailEndLine()` 按 CommonMark 列表项延续规则推断结束行：空行向后看（后续是缩进内容则继续，
    否则终止）、新任务行终止、标题行终止、同级或更浅列表项终止、更深子列表属于详情
  - `normalizeDetailLines()` 读入：**1:1 保留原文格式**（`==高亮==`、Tab 缩进层级、子列表符号都不动），
    只剥掉「所有非空行共有的那一层」列表缩进前缀（写回时会加回），行间相对缩进完整保留
  - `formatDetailLines()` 写回：每行补一级缩进，**行内已有的相对缩进原样保留**（不吞 Tab）；
    缩进字符跟随原文风格（原文有 Tab 就用 Tab，否则 2 空格）。往返幂等，连续编辑不累积缩进
- **不要改用 `ListItemCache.position.end`**：`MarkdownDataSource.parseFileFromContent` 构造的合成
  `listItems` 里 `end.line` 恒等于任务行本身，用它会让详情永远为空；metadataCache 的 end 对无缩进
  惰性续行也不保证。统一走自研推断，保证首扫与文件修改两条路径结果一致（已有测试锁定）
- 写回经 `TaskUpdates.details`（`null`/空串 = 清除）；**未传 details 时不触碰详情块**，
  避免误删用户在 Obsidian 里手写的内容
- 编辑面板显示为「任务详情」多行输入框，任务标题是另一独立字段（原「任务描述」已改名「任务标题」）
- **悬浮窗**：`tooltipSections.buildTooltipDetails()` 生成详情摘要（React `TooltipProvider` 与命令式
  `TooltipManager` 共用）。最多显示 `TOOLTIP_DETAIL_MAX_LINES = 4` 行，超出折叠为「…还有 N 行」；
  `==高亮==` 只去掉等号、不加背景色。悬浮窗 `pointer-events: none` 不可滚动，故必须截断

### 甘特图

实际实现是自定义 SVG 渲染引擎 `src/gantt/wrappers/svgGanttRenderer.ts`，支持拖动整体/端点、导航按钮、增量刷新。

### 设置系统

`SettingTab.ts` 使用 Builder 模式，各 builder 负责一个设置区域，未 React 化。

## 关键约定

**ALWAYS 遵守：**
- **DOM 类名**：在 `src/utils/bem.ts` 中定义 BEM 块常量并引用，禁止硬编码字符串
- **正则表达式**：在 `src/utils/RegularExpressions.ts` 中定义并引用，禁止内联正则
- **任务悬浮窗**：复用 `src/utils/tooltipManager.ts`，禁止自行实现
- **任务条目更新**：使用 `updateTaskProperties()` 函数，禁止直接操作 markdown 文本
- **修改 DOM/样式前**：先检查并移除已废弃的旧类名
- **React 代码**：UI 一律走声明式 React，禁止 createEl/createDiv/addEventListener 手写 DOM（基础组件/宿主/Icon 封装除外）

**代码模式：**
- 各视图在 `src/components/TaskCard/presets/` 下有对应配置 preset
- 右键菜单命令在 `src/contextMenu/commands/`，由 React 组件直接导入使用（`contextMenuIndex.ts` 已移除）
- 视图过滤状态按键名 `${viewName}SelectedStatuses`/`${viewName}SelectedTags` 持久化
- 模态框命令式入口：`openCreateTaskModal`/`openEditTaskModal`/`showConfirmDialog`（`src/ui/modals/`，经 `modalHost` 桥接）

## 注意事项

- **Windows 环境**：Git Bash 中 `2>nul` 会创建实体文件而非重定向，始终使用 `2>/dev/null` 或专用工具（Glob/Grep）
- **TypeScript**：`strictNullChecks: true`、`noImplicitAny: true`、`importHelpers: true`、target ES6
- **ESLint**：`no-unused-vars` 为 error（允许 `args` 前缀），`ban-ts-comment` 关闭；`prefer-active-doc` 在 portal/全局事件场景为 warning 可接受

## Git 规则

- **NEVER 自动 commit 或 push** — 仅当用户明确要求时执行
- 允许 `npm run build`、`git status`、`git diff` 等验证性操作
- `npm run version` 用于 bump manifest.json + versions.json