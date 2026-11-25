# TODO — 项目待办与进度追踪

> **会话规则（每次会话必读必做）**
> 1. **会话开始**：先读取本文件，了解进行中事项与上次进度
> 2. **会话中**：用户新提出的需求/功能/修复 → 及时追加到本文件对应章节
> 3. **会话结束**：将本次实际完成的事项标记为 `- [x]`，并移入「已完成」区注明日期
> 4. 遵守项目 Git 规则：**绝不自动 commit 或 push**

---

## 📌 进行中

> 2026-11-23 会话：日视图双时间轴两项 bug 修复 + **任务状态纯颜色化大重构**，均通过自动化验证
> （tsc 0 error、Jest 476 例全过、eslint 0 error、生产构建通过、已投放 vault 且 SHA256 一致）。
> 详见下方「已完成 → 2026-11-23」。以下仅保留需用户在 Obsidian 中人工确认的观感项。

- [ ] **任务状态纯颜色化重构 实测确认（2026-11-23）**
  - 复选框已从卡片与甘特图**彻底移除**，不再有「勾选完成」动作。
  - **状态列表现在是 5 个**：重要 / 已取消 / 进行中 / 有疑问 / 已开始（「待办」「已完成」已移除）。
    全部可编辑、可删除（无 `isDefault` 保护）。旧 data.json 会自动迁移，无需手动清理。
  - 「✅ 完成日期」「❌ 取消日期」两个字段已移除：编辑面板「日期设置」只剩创建/开始/计划/截止四项。
  - **同步功能已整体移除**：工具栏「同步」按钮、设置「同步」Tab、状态栏全部消失。
  - 待确认：① 编辑面板状态按钮是否为 5 个；② 无状态任务（`[ ]`）是否显示默认卡片色而非「重要」红；
    ③ 5 个状态能否自由增删改；④ 旧笔记 `[x]` / `✅` 是否按预期不再有完成语义。

- [ ] **日视图双时间轴实测确认（2026-11-23）**
  - **块下边缘与刻度错位已修复**：上一轮为放灰字提示多包了一层 flex 列容器，
    把画布 `flex:1` 从「横向填充」变成「纵向抢高度」，压掉画布内联 height（600px），
    块按 450px 渲染但下半截被裁 → 21:00 的块看起来停在约 18:40。
    现已撤掉包装层，并用**真实渲染测试**断言：右栏块 `top=0 / height=450px / 标签 12:00 – 21:00`。
  - 拖拽换算已修：左栏 11:00 拖到 11:30 就是 11:30；右栏 13:00 拖到 13:30 就是 13:30。
  - 跨 12:00 的块在左右栏各显示一截，其**被分栏裁切的边缘不可拖**（只渲染真实起止手柄），
    画布下方有灰字提示改用编辑面板修改。
  - 待确认：块下边缘是否已对上 21:00 刻度；左右栏拖动手感；灰字提示是否清楚。

- [ ] **周视图滚动窗口（±2 天）实测确认**
  - 现在每次点箭头，7 天窗口整体移动 2 天，首列可落在任意一天（不再强制周一）。
  - 滚动态标题改为纯日期区间（如 `11/18-11/24`），不再显示 `W47` 周号。
  - 「今天」按钮会清空偏移，回到标准周一/周日对齐。
  - 待确认：这个滚动手感是否符合预期；标题是否要保留周号（可改为「W47 · 11/18-11/24」混合式）。

- [ ] **底板色 `#EFF6FF` 观感确认（待用户最终确认）**
  - 已从 50%（#9CC2FF）→ 16%（#DFEBFF）→ 极浅天蓝 **`#EFF6FF`**（≈6% 蓝混白，等同 Tailwind blue-50）。
  - `--gc-canvas-tint: #EFF6FF`，视图背景叠 `var(--gc-canvas-tint, #EFF6FF)` 兜底；
    改用**硬编码色值**避免 `color-mix(var(--color-blue)…)` 在变量缺失时整条声明作废。
  - 自动化验证：真实 `styles.css` 渲染实测底板计算色 `rgb(239, 246, 255)`，与预期完全一致。
  - 仅剩主观观感确认：若仍觉偏深可降到 `#F5FAFF`，觉太淡可回到 `#E7F1FF`。
- [ ] **周视图块内「标签首行 / 文字次行」布局观感确认（待用户最终确认）**
  - 块宽约 110px 时文字曾被压到 ≈29px 导致逐字竖排（`Magpie` → `Ma/gpi/e`）；
    根因是 `.gc-task-card__text` 的 `flex-basis:0` + `min-width:0` 允许无限压缩，**不是标签抢宽**。
  - 现为：文字 `flex:1 1 100%` + `order:3` 独占次行整宽；标签 `order:1` 独占首行，
    最多 2 个 + `+N` 徽标；无标签块首行不占位、文字仍在第二行（基线统一）。
  - 真实 CSS 渲染实测：长标题正常横向折行（4 行）；4 个块 `textSameRowAsCb` 全为 `false`。
  - 若想恢复标签全量显示（不折叠 `+N`），把 `WeekTimelineGrid` 的 `maxTags: 2` 去掉即可。
  - 若想调 `+N` 上限（如 3 个），改 `maxTags` 的数字即可。
- [ ] **周视图「今天」标识观感确认（待用户最终确认）**
  - 整列/全天格红底已移除，仅表头日期数字为红色（`--gc-danger`）。
  - 若觉得只有数字变红太弱，可改为「日期数字加圆形红底徽章」（类似月视图 today 的实心圆）。
## ✅ 已完成（按日期倒序）

### 2026-11-25
- [x] **详情 1:1 保留 Obsidian 格式 + 悬浮窗详情灰底（2026-11-25）**：用户反馈两点。
  - **① 编辑面板详情改为 1:1 原样保留**：此前 `normalizeDetailLines` 会把「首行顶格 + 其余 Tab」
    的混排拉平（剥掉缩进），导致用户在编辑器里看不到真实层级。现改为**只剥掉所有非空行共有的
    那一层列表缩进**，行与行之间的相对缩进（Tab / 多级子列表）与 `==高亮==` 语法全部原样呈现；
    `formatDetailLines` 写回也不再吞掉行首 Tab（原先 `replace(/^\t/, '')` 会吃掉用户的二级缩进）。
    - 验证幂等性：连续往返 3 轮缩进不累积（`tests/taskDetails.test.ts` 专门锁定）。
    - 详情 textarea 新增 **Tab 键支持**（插入 Tab 字符而非跳焦点，Shift+Tab 退一个前导 Tab），
      并关闭拼写检查；`tab-size: 2` 让缩进在编辑器里可见。提示文案改为说明「格式原样保留」。
  - **② 悬浮窗详情区补上灰色底板**：改为与下方属性卡片同款 `background-color: var(--background-secondary)`
    + `border-radius: 6px` + 内边距，去掉原先的左侧竖线；详情行改 `white-space: pre` 以保留缩进层级
    （同时保留 `overflow:hidden` + `text-overflow:ellipsis` 防止长链接撑爆宽度）。
  - 悬浮窗的 `==` 处理维持上一轮决定：**只去掉等号、不加背景色**，但**保留行首缩进**
    （`buildTooltipDetails` 不再 `replace(/^[ \t]+/, '')`）。
  - 验证：tsc 0 error；Jest **558 例全过**（新增 `tooltipDetailsStyle.test.ts` 4 例锁定灰底/pre/省略；
    `taskFormDetails.test.ts` 增至 7 例含 1:1 格式与 Tab 键插入；`taskDetails`/`taskDetailsVault`/
    `tooltipDetails` 的旧「剥离缩进」断言按新契约改写）；改动文件 eslint 0 error；生产构建通过；
    已投放 vault 且三产物 SHA256 一致；产物 CSS 确认含 `background-color:var(--background-secondary)`
    与 `white-space:pre`。

- [x] **悬浮窗显示任务详情（2026-11-25）**：鼠标悬停在块/卡片上时，悬浮窗在**标题下方**显示任务详情。
  - **共用构建**：`tooltipSections.ts` 新增 `buildTooltipDetails()` + `TOOLTIP_DETAIL_MAX_LINES = 4`，
    React `TooltipProvider` 与命令式 `TooltipManager`（甘特图）两条渲染路径同源，内容永不漂移。
  - **显示策略（用户确认）**：详情最多显示 **4 行**，超出折叠为「…还有 N 行」（i18n `taskCard.detailsMore`，
    中英各 1 键）。悬浮窗是 `pointer-events: none` 无法滚动，故必须截断；完整内容看编辑面板。
  - **高亮语法（用户确认）**：`==文字==` **只去掉等号、不加背景色**，显示为纯文字。
    正则同时处理行内多段高亮与孤立 `==`。
  - **位置**：DOM 顺序 `description`（标题）→ `details`（详情）→ `properties`（属性区），
    测试断言了这三者的相对顺序。
  - **样式**：`tooltip.css` 新增 `__details`（左侧竖线 + 次级文字色）、`__details-line`（单行省略，
    防长链接撑爆宽度）、`__details-more`（淡色斜体）；BEM 新增 `details`/`detailsLine`/`detailsMore`。
  - 验证：tsc 0 error；Jest **548 例全过**（新增 `tooltipDetails.test.ts` 12 例构建契约、
    `tooltipDetailsRender.test.ts` 5 例**真实渲染**断言顺序/折叠/去号/无详情不渲染）；改动文件 eslint 0 error；
    生产构建通过；已投放 vault 且三产物 SHA256 一致。

- [x] **编辑面板「任务描述」改名「任务标题」+ 新增「任务详情」字段（2026-11-25）**：用户要求把任务行下方的多行内容（截图里那些高亮文字）做成可编辑的「详情」。
  - **新增 `src/tasks/taskDetails.ts`**：详情块的边界推断与缩进归一化（解析/写回共用同一套规则）。
    - `findDetailEndLine()` 按 CommonMark 列表项延续规则推断结束行：空行向后看（后续是缩进内容则继续，否则终止）、新任务行终止、标题行终止、同级或更浅列表项终止、更深的子列表属于详情。
    - `normalizeDetailLines()` 读入方向：剥掉公共缩进。**混排特例**——首行顶格 + 其余行缩进（用户手写常见）时改用「除首行外的最小缩进」拉平，避免编辑器里看起来仍带一截缩进。
    - `formatDetailLines()` 写回方向：统一加一级缩进，缩进字符跟随原文风格（原文用过 Tab 就继续 Tab，否则 2 空格）。
    - `detectTabIndent()` 检测原文缩进风格。
  - **`GCTask.details?: string`**：解析时由 `parseTasksFromListItems` 填充（已归一化）。
    **刻意不依赖 Obsidian 的 `item.position.end`**——文件修改事件路径（`parseFileFromContent`）构造的合成 `listItems` 里 `end.line` 恒等于任务行本身，用它会导致详情永远为空；metadataCache 的 end 对无缩进惰性续行也不保证。统一走自研推断，保证首扫与文件修改两条路径结果一致（测试专门锁定了这个 bug）。
  - **写回**：`TaskUpdates.details`（`null`/空串 = 清除）；`updateTaskProperties` 在写任务行后按 `details` 重排详情块；**未传 details 时不触碰详情**，避免误删用户在 Obsidian 里手写的内容。
  - **新建任务**：`CreateTaskData.details`，`insertTaskToFile` 把任务行 + 详情行一起插入。
  - **UI**：`TaskFormModal` 的「任务描述」改为「任务标题」（中英文案），新增「任务详情」多行 textarea（带灰色提示与 placeholder）；BEM 新增 `detailsContainer`/`detailsTextarea`/`detailsHint`；CSS 新增详情样式（`resize: vertical`、`tab-size: 2`）。
  - 验证：tsc 0 error；Jest **531 例全过**（新增 `taskDetails.test.ts` 19 例边界/归一化/往返、`taskDetailsVault.test.ts` 5 例**真实 vault 文件**解析、`taskDetailsWriteback.test.ts` 4 例写回隔离性、`taskFormDetails.test.ts` 5 例真实渲染）；改动文件 eslint 0 error；生产构建通过；已投放 vault 且三个产物 SHA256 全部一致。
  - 实测（真实 2026-11-23.md）：4 条任务正确解析，「三十三-小群」详情 8 行（1 行无缩进续行 + 7 行 Tab 子行）全部取出且缩进已剥离，「obsidian 插件」1 行，「fork gannt calendar」无详情，详情不会串到下一个任务。

- [x] **优先级功能整体删除剥离（2026-11-25）**：用户要求「把优先级逻辑全部删除剥离，不要这个了」，经确认选择「彻底移除整个优先级功能」。
  - **数据安全前置核查**：全库扫描 `🔺⏫🔼🔽⏬` 与 `[priority:: ...]` —— 用户笔记中**优先级标记 0 处**（emoji 命中均为正文无关 emoji），因此彻底删除不会丢数据。
  - **类型层**：`GCTask.priority`、`SortField` 的 `'priority'`、`MergeableTaskField` 的 `'priority'`、`setTaskMergeableField` 的 priority 分支、`data-layer/types` 的 `Priority`、`QueryOptions.priority`、`gantt/types` 的 `highestPriorityColor/mediumPriorityColor/lowPriorityColor`、`gantt GanttTask.priority`、`CreateTaskData.priority`、`TaskUpdates.priority`、`TaskChanges.priority` 全部删除。
  - **解析层**：`step4` 删除 `parseTasksPriority`/`parseDataviewPriority`、`ParsedTaskAttributes.priority`；`taskParser/main` 不再写 `task.priority`（「未规划时间」警告判据去掉 priority）；`taskSerializerSymbols` 删除 `PriorityLevel`、`TaskSymbolMapping.priority`、`TaskRegexMapping.priority`、`parsePriorityFromEmoji`、`parsePriorityFromDataview`、`priorityLevelToEmoji`、`priorityLevelToDataview`；`taskParser/utils` 删除 `hasValidPriority`；`RegularExpressions` 删除 `prioritySymbols`/`priorityRegex`/`priorityValues`/`anyPriorityRegex`。
  - **序列化层**：`taskSerializer` 删除 `getPriorityEmoji`、`MergedTask.priority` 与两处优先级输出分支；新建任务（`dailyNoteHelper.serializeNewTask`）不再写优先级，删除 `getPriorityEmoji`。
  - **排序**：`taskSorter` 删除 `PRIORITY_WEIGHTS` 与 priority 比较器，`SORT_OPTIONS` 由 6 项减为 5 项；`constants.ts` 的 `weekViewSortField` 由 `'priority'` 改为 `'dueDate'`。
  - **UI**：`TaskFormModal` 删除优先级板块、`PriorityOption`、`getPriorityOptions`、`priority` state 与保存分支；`TaskCard` 删除 `PRIORITY_ICONS`/`PRIORITY_CLASSES`、优先级徽标渲染与右键菜单优先级段；删除 `contextMenu/commands/setPriority.ts`；`TaskListPanel` 删除优先级筛选菜单/state/排序字段；`Toolbar` 排序菜单去掉 priority 项；`tooltipSections` 删除优先级段与 `PRIORITY_ICONS`；`createNoteFromTask` 不再写「优先级」行；`taskDataAdapter` 不再产出 `priority-*` 类名；`svgGanttRenderer` 两处按优先级着色改为统一 `--interactive-accent`。
  - **设置**：`defaultTaskPriority`、`taskView/dayView/weekView/monthView/sidebarShowPriority`（5 个）、`TaskCardConfig.showPriority`、各视图 preset 的 `showPriority`、`TaskSettingsBuilder` 的默认优先级下拉、`CardDisplaySettingsBuilder` 的优先级 chip 全部删除。
  - **BEM/CSS**：`bem.ts` 删除 `TaskCardClasses.elements.priority/priorityBadge`、`PriorityClasses`、`EditTaskModalClasses` 的 4 个 priority 元素；`editor.css` 删除优先级徽标样式、`edit-task-modal.css` 删除优先级按钮/网格/手机端媒体查询、`gantt.css` 删除 5 条优先级配色、`tooltip.css` 删除 5 条、`week-view.css` 删除 `__priority` 规则。
  - **i18n**：中英各删除 `common.priority`、`settings.tasks.creation.defaultPriority`、`cardDisplay.chips.priority`、`modals.editTask.priorityLabel`、`toolbar.sort.options.priority`、`contextMenu.commands.priorityUpdated/priorityUpdateFailed`、`sidebar.taskList.filterBar.priorityFilter`、`sidebar.taskList.priority`、`sortOptions.byPriority`、`taskCard.priority`。
  - **保留（数据兼容层，勿删）**：`DescriptionExtraction.removePriorityEmoji`（从旧笔记文本剥离 emoji）与 `taskUpdater` 的 `KNOWN_DV_FIELDS` 中的 `priority`（视为已知字段、不重复回写）。
  - 验证：tsc 0 error；Jest **498 例全过**（新增 `tests/priorityRemovalContract.test.ts` 21 例锁定全链路契约；`taskSorter.test.ts` 重写为无优先级契约 15 例；`step4`/`serializer-roundtrip` 旧优先级断言按新语义更新）；改动源码目录 eslint **0 error**；生产构建通过；已投放 vault 且 `main.js`/`styles.css`/`manifest.json` SHA256 全部一致；产物 `main.js` 784KB → **773KB**，且 `priority-highest`/`priorityLabel`/`defaultTaskPriority`/`ShowPriority` 四项残留检查全为 False。
  - **数据安全实测**：用真实任务行（含 2026-11-23/24 的实际笔记内容）跑解析+写回，确认描述/标签/➕🛫📅 日期全部无损、不产出任何优先级 emoji；旧笔记含 `⏫` 的任务写回后 emoji 被清理而其余字段完整。
  - 遗留（既有，非本次改动）：`tests/dayViewCanvasBlockAlign.test.ts`、`tests/statusColorOnlyContract.test.ts` 仍有 4 个既有 eslint error（多余断言 / require 导入），待单独清理。

### 2026-11-24
- [x] **日视图/侧栏单任务被重复渲染成多个重叠块（2026-11-24）**：用户截图显示 24 号 21:00–22:00 的「流量不够用」被画成 3 个并排块，但 vault 里只有 1 条任务行（`- [ ] 🎯 流量不够用 ➕ 2026-11-24 🛫 2026-11-24 21:00 📅 2026-11-24 22:00`）。
  - **根因（数据层重复键）**：`MarkdownDataSource.detectChangesByIds` 的行号漂移「重配」用**历史缓存键 id** 回传 `updated {id: oldId, task: newTask}`，而 `TaskRepository` 直接 `set(id, newTask)`。当文件行号来回变动时，仓库会以**不同的历史键**各自存下同一个任务的副本（各键的值指向同一真实行），`getAllTasks()` 便返回多条 → 日视图/侧栏模型把它们当成重叠块并排渲染（lane 0/1/2）。放大验证：单任务经 `buildDayTimelineModel` 只产生 1 块（已用真实文件确认），故重复只能在数据层。
  - **修复**：① `TaskRepository.handleSourceChanges` 更新分支做**规范键归一**——当 `generateTaskId(newTask) !== id` 时删除旧键、写入规范键（`filePath:lineNumber`），从此不再累积；② `TaskRepository.getAllTasks()` 按值的 `filePath:lineNumber` **去重**（同身份优先保留「键=身份」的规范条目），即使已存在多键同值也收敛为 1 条（一行只对应一条任务，去重安全）。新增 `fileIndex` 的 `indexAdd/indexRemove` 辅助并统一 created/deleted 分支。
  - 验证：tsc 0 error；Jest **486 例全过**（新增 `tests/taskRepositoryDedup.test.ts` 3 例：单次漂移归一、多次来回漂移恒为 1 条、脏多键同值去重）；改动文件 eslint 0 error；生产构建通过；已投放 vault 且 `main.js`/`styles.css`/`manifest.json` SHA256 全部一致。
  - 注意：用户当前会话残留的重复条目需**重载插件**后由首扫重建清除；本修复防止再次累积。

### 2026-11-23
- [x] **编辑面板「任务状态」单选交互修复 + 「已取消」改绿（2026-11-23 续）**：针对用户三点反馈（选中无视觉反馈 / 选后无法取消 / 已取消灰改绿）。
  - **根因（选中看不出）**：`edit-task-modal.css` 的选中态选择器写成 `.gc-edit-task-modal__status-btn-selected`（单横线），而 `bem()` 生成的是 `--selected`（双横线），**选中样式从未命中**。已改为 `--selected`，并做成明显样式：实心强调色填充 `var(--interactive-accent)` + 主色描边 + 右侧对勾 `.gc-edit-task-modal__status-btn-check`（在 `bem.ts` 新增 `statusBtnCheck`）。
  - **再次点击可取消**：`TaskFormModal` 状态初值由 `'todo'`/默认首项改为空串 `''`（= 无状态）；点击改为 `setStatus(selected ? '' : option.key)`；保存 `updates.status=''` → 写回 `[ ]`（无状态色）。创建模式默认无状态。
  - **已取消改绿**：`DEFAULT_TASK_STATUSES` 的 `canceled` 由灰 `#d9d9d9`/`#4a525c` 改为原「已完成」绿 `#52c41a`（暗色 `#3c8524`）；新增 `SettingsManager.migrateCanceledStatusColor()`，把旧 data.json 中仍为历史灰 `#d9d9d9` 的「已取消」同步改为绿色（仅命中历史灰，避免覆盖用户自定义色）。
  - **顺带**：`priority-btn` 的选中态选择器同样错写为 `-selected`，一并改为 `--selected`。
  - 验证：tsc 0 error；Jest **483 例全过**（新增 `tests/taskFormStatusToggle.test.ts` 5 例真实渲染断言：选中带 `--selected`+对勾、未选中无、再点取消、单选互斥、创建模式默认空；`taskStatus.test.ts` 增 1 例绿色断言；`serializer-roundtrip.test.ts` 增 1 例空串→`[ ]`）；改动文件 eslint 0 error；生产构建通过；已投放 vault 且 `main.js`/`styles.css`/`manifest.json` SHA256 全部一致。
  - 既有遗留（非本次改动）：`tests/dayViewCanvasBlockAlign.test.ts`(120/147/148) 与 `tests/statusColorOnlyContract.test.ts`(135) 有 4 个既有 eslint error（多余断言 / require 导入），待单独清理。

- [x] **会话产出整理与校验（按 AGENTS.md 协议）**：完成本轮重构的文档同步与代码残留清理。
  - `CLAUDE.md` 更新：测试数量（270 → 476 用例 / 38 suite，补 Windows `--runInBand` 说明）；
    数据层架构图移除 `SyncManager`；新增「任务状态（2026-11-23 重构后）」章节（5 个纯颜色状态、
    空格=无状态返回空串、无 completed/cancelled、无完成/取消日期、状态全部平等、迁移函数）；
    新增「已移除的子系统」章节（同步系统 / 状态栏 / 完成取消语义）；删除 `SyncResultDialog`
    与 `showSyncResultModal` 引用。
  - 代码残留清理：`bem.ts` 移除废弃的 `canvasColumn`；`main.ts` 修正提及 `syncManager` 的过期注释；
    `data-layer/types.ts` 的 `DataSourceConfig` 移除已无消费者的 `api`/`caldav` 分支；
    `RegularExpressions.ts` 移除孤立的 `FeishuSummarySanitize`。
  - 校验：tsc 0 error、Jest **476 例全过**、eslint 0 error（1 个既有 warning）、构建通过、
    已投放 vault 且 SHA256 一致、`node --check` 通过。
  - 核心逻辑实测（5 个临时断言，全过）：5 个状态无重复且颜色完整、空格返回空串且查不到颜色、
    5 个符号均能反查、`todo`/`done` 彻底失效。
  - 遗留：`README.md` / `README_zh.md` 仍描述已删除的飞书同步，已记入「💡 新需求」待单独处理。

- [x] **任务状态精简为 5 个纯颜色状态（移除待办/已完成）**：`DEFAULT_TASK_STATUSES` 从「todo + done」改为「important / canceled / in_progress / question / start」5 项——**这 5 个同时充当 settings 未就绪时的兜底默认值**，此前兜底只有 2 项，导致编辑面板在 settings 为空时退化成 2 个按钮（用户截图现象）。
  - `PRESET_CUSTOM_STATUSES` 改为 `DEFAULT_TASK_STATUSES` 的别名（保留导出仅为兼容）；`ALL_BUILTIN_STATUSES` 不再拼接它，避免重复项。
  - 新增 `SettingsManager.migrateRemoveCompletionStatuses()`：加载设置时剔除 `todo`/`done`（全部删空时补回默认 5 项），旧 data.json 自动迁移。
  - `DefaultTaskStatusType` 从 `'todo' | 'done'` 放宽为 `string`。
  - **关键修复**：`parseStatusFromCheckbox(' ')` 改为返回**空字符串**（表示「无状态」）。此前回退到默认首项会导致**所有 `[ ]` 普通任务被染成「重要」色，写回时还会把 `[ ]` 改写成 `[!]`**——这是本轮引入又被测试抓出的回归。
  - 各视图默认状态筛选、`inferStatus`、`getInferredStatus`、虚拟任务、编辑面板初始值等回退值同步改为「默认首项 / 空串」。
  - 验证：tsc 0 error、Jest **476 例全过**、eslint 0 error（1 个既有 warning）、构建通过、已投放 vault 且 SHA256 一致；迁移逻辑用 3 个临时用例实测（7→5、删空补回、幂等）通过。

- [x] **任务状态纯颜色化重构（大重构）**：7 个任务状态从「完成/取消语义 + 颜色」彻底降级为**纯颜色标签**，只用于块/卡片底色。
  - **剔除复选框功能**：`TaskCard` 删除 `<input type="checkbox">` 与 `handleCheckboxChange`；甘特图删除 `createTaskCheckbox`、复选框增量更新、进度条（`progress` 相关 15 处）及完成色分支；`TaskCardConfig.showCheckbox` 与 5 个 `*ViewShowCheckbox` 设置项（constants/types/各视图/预设/显示控制面板行）全部移除。
  - **剥离完成/取消语义**：`GCTask` 删除 `completed` / `cancelled` / `completionDate` / `cancelledDate`；`CheckboxStatus` 只保留 `status`；`step4.parseCheckboxStatus` 不再产出完成态；`taskSerializer` 复选框符号只由 status 决定；`inferStatus` / `getInferredStatus` 统一回退 `'todo'`；删除 `updateTaskCompletion`、`cancelTask`、`restoreTask`、`recurringTaskCompleter`；右键菜单删除「完成/取消/恢复」项；各视图删除 `!t.cancelled` 过滤。
  - **移除 ✅/❌ 日期字段**：`DateFieldType` 只剩 `createdDate/startDate/scheduledDate/dueDate`；`RegularExpressions` 删除 `✅`/`❌` 符号与 `completionDateRegex`/`cancelledDateRegex`；`taskSerializerSymbols` 删除两字段映射；编辑面板「日期设置」只剩创建/开始/计划/截止四项；工具栏字段选择器与排序选项同步移除；`SortField` 去掉 `completionDate`；`TaskDates` 去掉 completed/cancelled。
  - **移除同步子系统**：删除 `data-layer/feishu-sync`、`data-layer/sources`（api + caldav）、`data-layer/sync`、`managers/SyncManagerBridge`、`commands/feishuCommands`、`settings/builders/SyncSettingsBuilder`、`ui/modals/SyncResultDialog`、`statusBar`；拆掉 `commandsIndex` / `SettingTab`（同步 Tab）/ `builders/index` / `Toolbar` / `MobileNavDock` / `main.ts` 的引用；删除 `SyncConfiguration` 接口与 `settings.syncConfiguration`；删除相关测试 4 个。
  - **7 个状态完全平等**：`DEFAULT_TASK_STATUSES` 与 `PRESET_CUSTOM_STATUSES` 的 `isDefault` 全部改为 `false`，设置界面里 7 个状态都可编辑、可删除（原 `todo`/`done` 受保护无法删除）。
  - **删除完成态视觉**：`theme.css` 移除 `.gc-task-card--completed`（透明度 + 绿色条）、`text-decoration: line-through` 与置灰规则。
  - **类型统一**：`gantt/types.ts` 与 `tasks/taskSerializerSymbols.ts` 各自重复声明的 `DateFieldType` 改为复用 `settings/types` 的单一来源（曾因两处枚举漂移导致删字段后类型不兼容）。
  - 验证：tsc 0 error、Jest **476 例全过**（新增 `statusColorOnlyContract.test.ts` 17 例锁定契约）、eslint 0 error（1 个既有 warning）、生产构建通过、已投放 vault 且 SHA256 一致、`node --check` 通过。产物 `main.js` 从 929KB → **783KB**（同步子系统移除生效）。

- [x] **日视图块下边缘与时间刻度不匹配修复（21:00 显示成 ~18:40）**：上一轮为放灰字提示，在画布外多包了一层 `.gc-day-canvas__canvas-column`（`display:flex; flex-direction:column`）。画布原本 `flex:1`，在**行**容器里是横向填充，一旦进入**列**容器就变成 `flex-basis:0` 控制**高度**，把画布内联的 `height`（窗口时长 × HOUR_PX = 600px）压成可视区高度（~332px），块按 450px 渲染但下半截被裁 → 看起来停在 18:40。修复：撤掉包装层，画布恢复为 `__body` 直接子元素；灰字提示移到 `.gc-day-canvas` 根节点下（body 的兄弟）；`.gc-day-canvas__body` 补 `flex:0 0 auto` 防止被列容器压缩。**验证方式改为真实渲染断言**（`tests/dayViewCanvasBlockAlign.test.ts` 7 例，直接挂载 DayTimelineCanvas 断言块内联 top/height：右栏 `top=0 / height=450px / 标签 12:00 – 21:00`，左栏 `top=487.5 / height=112.5`），不再依赖像素截图（易被 tooltip 浮层与缩放干扰）。
- [x] **日视图双时间轴 resize 拖拽换算修复**：右栏（12:00–24:00）画布的 `rect.top` 是**它自己**的顶部，`useBlockResize` 的 `move` 只做 `pxToMinutes(clientY - rect.top)` 而**没加回 `windowStartMin`**，于是鼠标在右栏 13:00 处被算成 01:00（用户报告的"拖拽有 BUG"根因）。修复：`useBlockResize` 新增 `options.windowStartMin/windowEndMin`，换算改为 `pxToMinutes(...) + winStart`，钳制范围从固定 `[0,1440]` 改为窗口边界，乐观预览 `top` 减去窗口起点；`DayTimelineCanvas` 接线传入窗口边界。同类修复：`useCanvasTouchDrag` 新增 `windowStartMin`（触屏整块拖动同样缺偏移）。**跨分栏假边缘禁拖**：跨 12:00 的块在分栏边界被裁切，那条线不是真实起止，拖它会写错时间——改为 `realTopEdge/realBottomEdge`（`!continuesBefore` / `!continuesAfter`）才渲染 resize 手柄。新增画布下方灰字提示 `splitCanvasHint`（仅分栏模式渲染，i18n 中英各 +1 键）。新增 `tests/dayViewSplitCanvasResize.test.ts` 17 例（含"13:00 被算成 01:00"的 bug 复现对照）。

### 2026-11-22
- [x] **周视图左右箭头改为真滚动窗口（每次 ±2 天）**：原 `navigate()` 只做 `currentDate + 2*dir`，而 `WeekView` 用 `getWeekOfDate → startOfWeek` 把日期吸附到周首日，**未跨周边界时显示的仍是同一周**，位移被抹平（用户实测"点了没反应"，连点 3 次才跳一次）。修复：新增 `dateUtils/week.ts` 的 `getWeekFromStart(startDate)`（从任意起点铺 7 天，**不吸附**）；`calendarStore` 新增 `weekWindowStart`（7 天窗口起点，null=按周对齐）+ `setWeekWindowStart`，`setCurrentDate` 自动清空该字段；`Toolbar`/`MobileNavDock` 的 week 分支显式推进 `weekWindowStart`（±2 天）并同步 `currentDate` 落到窗口第 3 天（保证新建任务等入口落在可见范围）；标题在滚动态改为纯日期区间（窗口可跨两周，W 周号会误导），`goToday` 清空偏移回到标准周对齐；手机端 swipe 越界从「整周 ±7」改为「±1 天」滚动。新增 `tests/weekRollingWindow.test.ts` 8 例（含**原 bug 复现对照**：只推 currentDate 时前三次起点全为 11-16）。
- [x] **周视图「今天」不再整列染红**：原 `theme.css` 三条规则把今天列（`day-col--today` rgba 0.08 红）、全天格（`allday-cell--today`）、表头（`header-cell--today` rgba 0.1 红）全染红，整排红底与浅蓝底板 + 白色任务块冲突。改为列/全天格 `background-color: transparent`，**仅表头日期数字保留 `--gc-danger` 红字**作为「今天」标识；`week-view.css` 的 `day-col--today` 也从 `--background-primary-alt` 改为 transparent。
- [x] **周视图无标签任务保留标签行位置**：去掉原 `:has()` 把文字 `flex-basis` 改回 `0` 的兜底规则——那会让无标签块的文字回到首行与复选框同行，导致同列「有标签/无标签」块标题基线错开。现统一由 `flex:1 1 100%` 保证所有块文字都在第二行。真实 CSS 渲染实测 4 个块（2 有标签 / 2 无标签）`textSameRowAsCb` 全为 `false`。
- [x] **周视图移除「全天」文字标签**：`WeekTimelineGrid` 不再渲染 `alldayGutter` 标签（它绝对定位贴左上角会压住第一列），同时清理未使用的 `allDayLabel` 变量、`bem.ts` 的 `alldayGutter` 常量与 `week-view.css` 的 `.gc-week-view__allday-gutter` 规则（遵守 CLAUDE.md「移除废弃旧类名」）。
- [x] **周视图块内标签挤压文字修复（标签首行 / 文字次行）**：块宽约 110px 时首行的复选框 + 标签药丸把标题压成逐字竖排（`Magpie` → `Ma/gpi/e`）。**根因不在标签抢宽**，而在 `.gc-task-card__text` 的 `flex-basis:0` + `min-width:0` 允许文字被压到接近 0 宽。改为文字 `flex:1 1 100%` + `order:3` 独占次行整宽，标签 `order:1` + `flex:1 1 auto` 独占首行（与复选框同行），优先级 `order:2` 推到行尾；块内标签缩到 `--gc-font-xxs` + `padding:0 4px`；新增 `maxTags` 配置（`TaskCardConfig` + `TaskCard.tsx` 截断渲染 `+N` 徽标，`DayColumn` 内套 `maxTags:2`，全天横跨条不受限）；关键点：旧的非 flow 通用规则改用 `:not(.gc-week-view__time-block--flow)` 排除，否则同特异性 + 更靠后会把 `flex-basis` 覆盖回 0。新增 `tests/weekBlockTagLayout.test.ts` 14 例锁定契约。
- [x] **日视图改左右双时间窗**：左栏 00:00–12:00、右栏 12:00–24:00，移除右侧嵌入式 Daily Note 面板；`DayTimelineCanvas` 新增 `startHour`/`endHour` 参数（画布高度/刻度/指针换算/ghost/拖放/resize 全部以窗口为坐标系，跨窗口块裁剪 + 延续标记）；`DayView` 固定双栏布局，删除 `EmbeddedNoteEditor`/`useResizeDivider`/`dayViewLayout` 分屏逻辑；新增 bem `splitCanvas`/`canvasPane`/`canvasDivider` 与窄屏上下堆叠样式；`dayViewNarrowLayout.test.ts` 重写为双窗契约 3 例。
- [x] **日视图移除「当日任务」标题**：纵向空间让给时间刻度。
- [x] **周视图改列表式堆叠布局**：删除左侧 0-24 时间刻度列与小时网格线，块按开始时间升序自上而下排列，高度按文字内容自适应（取消 timeline 变体的固定 24px + nowrap + ellipsis，改用双类选择器覆盖为 `height:auto`/`flex-wrap:wrap`/`overflow:visible`）；时刻文字由右上角绝对定位改为独占首行右对齐（不再遮挡标题）；拖拽语义改为**只改日期、保留原时刻**（`commitBlockMove` 的 `minutes: number | null`，`useCanvasTouchDrag` 新增 `resolveMinutesFromPointer` 开关）；**关闭空白点击创建**（无时间轴无法从位置推算时刻），新建走工具栏「+」；移除当前时间指示线。
- [x] **周视图列错位修复**：删除 48px 刻度列后全天行仍用 `gridColumn: '2 / -1'` 且「全天」标签独占第 1 列，与 7 个日列挤位导致任务块整体右偏一格。全天行改 `'1 / -1'` 占满整行，「全天」标签改行内绝对定位贴左上角。实测 7 列表头与日列 left 差值全部 0.0px。
- [x] **月视图日期头任务数徽标**：日期格顶部行右侧新增任务数小圆（统计格内锚定任务 + 覆盖当天的跨天横跨条，0 个不渲染，>99 显示 99+，带悬浮提示）。最终配色为浅蓝底红字。
- [x] **月视图格内溢出可滚动 + 只读细滚动条**：所有日期格统一显示全部任务（取消 `monthViewTaskLimit` 对格内卡片的截断）、挂 `tasksScrollable` 与贴右 3px 只读滚动条（`pointer-events:none` 不可拖拽，原生滚动条隐藏）。关键修复：`.gc-month-view__day-cell` 与 `.gc-month-view__tasks` 补 `min-height:0`——flex 子项默认 `min-height:auto` 会被内容撑高，`scrollHeight` 恒等于 `clientHeight` 导致 `overflow-y:auto` 永不触发。
- [x] **月视图取消滚轮切月**：空白处滚轮不再拦截、不切月；仅日期格内溢出时滚动其内容。移除 `createMonthWheelStep`/`shiftMonth` 调用与 `stepWheelRef`（`monthWheel.ts` 工具函数保留）。
- [x] **月视图滚轮监听失效修复**：`viewRef` 原挂在 `<motion.div key={monthKey}>`，切月时 key 变化导致节点销毁重建、监听器绑在旧节点上（表现为「第一次能切月，之后失效」）。`ref` 移到外层常驻 `.gc-month-anim`；滚轮分支改为先 `closest(dayCell)` 再判断 class，避免 `popLayout` 退场节点干扰。新增 `tests/monthViewWheelHost.test.ts` 6 例锁定契约。
- [x] **周视图左右箭头步长 7 天 → 2 天**：`Toolbar.tsx` 与 `MobileNavDock.tsx` 的 `navigate()` 同步改为 `setDate(getDate() + 2 * dir)`。
- [x] **日/周视图底板浅蓝**：新增 `--gc-canvas-tint` 令牌，最终定为极浅天蓝 **`#EFF6FF`**（≈6% 蓝混白，等同 Tailwind blue-50）。改用**硬编码色值**而非 `color-mix(var(--color-blue)…)`——后者在主题变量缺失或 color-mix 不被支持时整条声明作废（曾表现为「颜色没生效」）；视图背景再叠 `var(--gc-canvas-tint, #EFF6FF)` 兜底。实测底板计算色 `rgb(239,246,255)` 与预期完全一致。
- [x] **右键菜单任务状态改为动态生成**：原硬编码「重要/有疑问」两项，改为读取 `settings.taskStatuses` 全量渲染（含用户自建），新增段标题与选中对勾、状态颜色圆点。
- [x] **编辑面板新增「任务状态」板块**：`TaskFormModal` 支持创建/编辑两种模式下的状态选择，创建时经 `resolveStatusSymbol()` 写入正确复选框符号（原硬编码 `[ ]`）。
- [x] **给过往日期添加任务写错 Daily Note 修复**：`createTaskInDailyNote()` 原硬编码 `window.moment()`/`new Date()` 忽略目标日期，新增 `resolveDailyNoteDate()`（targetDate → createdDate → 今天，归一化零点），日记查找/创建/模板变量全部改用该日期；新增 `tests/dailyNoteTargetDate.test.ts` 8 例。

### 2026-11-17
- [x] GitHub issue 定期监控：新增 `scripts/check_github_issues.py`（抓取 issues 列表页内嵌 JSON，无需认证、规避 API 匿名限流）；创建 Harness 定时任务「检查 GitHub issue 并发送汇总」，每天 10:00（Asia/Shanghai）运行脚本并与历史对比汇总新增/有更新的 issue 到本会话。注：基线 11 个 open issues（#31/#34-#43）。11-18 追加：gh CLI 重新认证成功后，定时任务已切换为 `gh issue list`（认证限额 5000 次/小时），Python 脚本保留作后备。

### 2026-11-13
- [x] 移动端时间线触屏创建手势重做：按下不再立即显示蓝色预览、不再阻止滚动；长按 500ms 后才允许创建，长按后拖动为自定义区间、长按后不拖动为默认 1 小时区间，短按与普通滑动不创建任务；桌面鼠标路径（点击创建、拖拽选区、hover 预览）保持原样。新增共享模块 `src/ui/views/week/timelineTouchCreate.ts`（长按与抖动阈值、非被动 touchmove 滚动拦截、统一手势状态类型）；改造 `DayTimelineCanvas`（侧栏每日时间线 + 日视图）与 `WeekTimelineGrid` 的 DayColumn（周视图）；document 监听改用稳定包装函数统一解绑，避免 `touch-action: none` 残留导致画布无法滚动；两个画布补 user-select / touch-callout 禁用。新增 4 个 jsdom 回归用例；lint 0 error（4 个既有 warning）、tsc + build 通过、441 个 Jest 用例全过。

### 2026-10-27
- [x] dateFilterField 设置退场，单日期任务锚定改为内置回退链 due→scheduled→start：新增 resolveAnchorDateField（src/types.ts），timelineModel 三个模型构建器与 getTaskInterval 去 dateField 参数改为链内解析，拖拽写入目标 = 锚定字段 ?? ganttEndField，generateVirtualInstances 第 4 参改可选（任务视图仍传 taskViewTimeFieldFilter，甘特仍传 ganttStartField），TaskCard 重复任务完成写入走链；设置项/常量/i18n 键移除；tsc + 437 Jest 用例（新增回退链 6 例）+ build 全部通过

### 2026-10-16
- [x] T15.1 飞书同步日期+时间精度适配修复：完成 is_all_day 透传、双向精度检测、日期/完成时间归一化、哈希与合并适配；通过 tsc、431 个 Jest 测试和 npm run build

### 2026-10-15
- [x] T1 TypeScript 5.x + 全量 strict：升级 TypeScript，收紧 tsconfig/test 配置，删除 deprecated 转发层 `src/tasks/taskParser.ts`
- [x] T2 删除确认 + deleteTask 加固：确认交互、文件锁保护和删除后按原始行索引可靠恢复
- [x] T3 首扫批量事件：避免逐任务定时器刷新，首扫完成后统一发布批量事件
- [x] T4 状态栏统计防抖：合并高频刷新，通过值比对减少无效更新
- [x] T5 任务操作撤销：属性变更与删除任务支持 Notice 撤销按钮，采用单槽撤销策略

### 2026-10-13
- [x] `.gitattributes` 统一 LF，根治 CRLF 幻影修改（1210f51）
- [x] P1 性能：首扫完成后不再整视图重挂（300a5c1）
- [x] P0 性能：启动 Load layout ~10s 卡顿根治，骨架屏 + 异步首扫（11e458b）
- [x] 移动端导航 Dock + 桌面窄窗口日视图适配（d638089）
- [x] README 双语更新：秒开启动 / 导航 Dock / 窄窗口适配（本次会话）
- [x] 创建 AGENTS.md 会话协议：会话开始/结束必须读取 TODO.md
- [x] 创建本 TODO.md 追踪体系

### 2026-10-12 及更早
- [x] 1.6.2 发布，官方审查通过（9b437de）
- [x] 设置页 1.11/1.12 兼容层移除，minAppVersion → 1.13.0（a061309）
- [x] 任务弹窗打开卡顿三轮修复（5ea4dde）

---

## 📋 待办 — 全面改进计划（17 个有效任务，T12 已取消；详见 docs/plans/2026-10-12-full-improvement.md）

### Phase A — 基础设施与安全网
- [x] T1 TypeScript 5.x + 全量 strict
- [x] T2 删除确认 + deleteTask 加固
- [x] T3 首扫批量事件
- [x] T4 状态栏统计防抖 + 值比对
- [x] T5 任务操作撤销

### Phase B — 渲染性能
- [ ] T6 settingsVersion 退场：设置进 store
- [ ] T7 列表虚拟化 + 日期范围索引（react-virtuoso + 日期桶索引）

### Phase C — 视觉增强
- [ ] T8 CSS token 落地清扫（硬编码色 169 → <20）
- [ ] T9 优先级图标化（emoji → Lucide 单一映射源）
- [ ] T10 Modal focus trap

### Phase D — 交互增强
- [ ] T11 快捷键体系
- [ ] T13 自然语言日期轻解析
- [ ] T14 拖拽边缘自动滚动

### Phase E — 架构治理与交付
- [ ] T15 同步系统特征测试 + 口径 bug 修复
- [ ] T16 同步架构收敛：老引擎迁移至新框架
- [ ] T17 GitHub Actions CI
- [ ] T18 首次安装引导（空库示例卡）

---

## 🚫 已取消 / 不做

### T12 月格双击快速创建

- 2026-10-15：用户确认不需要，已从待办计划移除，不进入实施。

## 🔭 远期路线图（v2.0.0，来自 README Roadmap）
- [ ] 第三方日历订阅（飞书日历、Outlook 日历）
- [ ] Microsoft To Do 同步
- [ ] 通过 CalDAV 接入 Google / Apple 日历

---

## 💡 新需求（会话中提出，待排期）

### README 同步功能描述待清理（2026-11-23 重构遗留）
- 背景：同步子系统（飞书 / CalDAV）已于 2026-11-23 整体删除，`CLAUDE.md` 已同步更新，
  但 `README.md` 与 `README_zh.md` 仍保留大量飞书同步的功能介绍、配置步骤与命令说明
  （README.md 第 33/83/141/397-477 行等）。
- 影响：不影响运行，仅文档与实际能力不符。
- 验收点：两份 README 移除「Feishu Sync / CalDAV」相关章节与命令表条目，
  并补充「任务状态为纯颜色标签、无完成语义」的说明。
- 未立即处理原因：中英两份各 30KB+，改动面大，需单独一轮处理。

### 日记输出文件夹（2026-11-21 提出，用户决定暂缓）

- 需求：新建的日记想放到指定文件夹，期望入口在「设置 → 通用」。
- 结论：**插件已有等价功能，无需新做** ——「设置 → 日历 → Daily Notes」的手动模式下有
  文件夹 / 文件名格式 / 模板三项，可直接自定义路径。
  但需先关闭「使用 Obsidian 日记设置」开关：该开关开启时手动模式区域被 `sectionHidden` 隐藏。
- 现状说明：用户 `followObsidianDailyNote = true`，且 vault 无 `.obsidian/daily-notes.json`，
  Obsidian 取默认值（根目录 + `YYYY-MM-DD`），故 `2026-11-18.md` 等日记都落在 vault 根目录。
- 曾实现的 `dailyNoteFolderOverride` 覆盖方案（可跨「跟随 Obsidian / 手动」两种模式生效，
  且保留原模式的命名格式与模板）已按用户要求完整回退，代码未保留。

### GitHub Issue #43 标签等优化（2026-11-17 分析，https://github.com/sustcsugar/obsidian-gantt-calendar/issues/43）
- [x] 诉求 1·标签隐藏选项（2026-11-18 完成）：补齐任务视图四开关 taskViewShowCheckbox/Tags/Priority/Ticktick，设置 → 视图 → 任务卡片显示控制新增任务视图行，UI 与其他视图一致，默认值与原 preset 一致（commit 089b0f6）
- [ ] 诉求 2·标签放在任务之后：TaskCard 渲染顺序已是 description→tags（TaskCard.tsx:429→437），与 #35 子诉求"标签后置"同源，预计解析层已支持，合并做端到端验证后统一回复
- [ ] 诉求 3·编辑任务自动填充计划(scheduled)日期：TaskFormModal 编辑模式 scheduledDate 为空时不回填（TaskFormModal.tsx:138），用户期望与开始日期一致时自动填充；需确认交互（自动复制 startDate 或仅默认值）

### 移动端触屏创建手势真机验证（2026-11-13 提出）
- [ ] 在 Obsidian 移动端侧栏 / 日视图 / 周视图实测：上下滑动时间线顺畅无蓝色预览闪烁、长按后拖动可创建自定义区间、长按不拖动创建默认 1 小时区间；确认长按 500ms 与抖动阈值 12px 的手感是否合适

### GitHub Issue #35 审查结论（2026-10-27，https://github.com/sustcsugar/obsidian-gantt-calendar/issues/35）
> 设计澄清（用户 2026-10-27）：任务视图定位是独立全功能筛选面板（自带 taskViewTimeFieldFilter，不跟 dateFilterField 联动是有意为之）；日/周/月/年时间线重设计后跨度任务由 ganttStartField/ganttEndField 驱动。#35 的「任务视图不跟设置走」部分属设计如此，非 bug，回复 issue 解释设计即可。
- [x] dateFilterField 设置退场：单日期任务改为内置回退链锚定（due→scheduled→start，resolveAnchorDateField），替代原 4 个残留角色（单日期可见性/锚定、时间线拖拽写入目标、重复任务展开字段、TaskCard 重复完成写入）；设置项与 i18n 键已移除，旧 data.json 残留键无害
- [x] 子诉求·分视图打开命令（2026-11-17 完成）：移除 open-calendar-view，改为 open-day/week/month/year/gantt-view 五条分视图命令 + open-task-view（src/commands/common.ts 重构为映射表循环注册），i18n 键同步更新；tsc + build + 441 Jest 用例全过
- [ ] 子诉求·排序「保持原样」：SORT_OPTIONS（src/tasks/taskSorter.ts:12）无 original 项，需新增保序选项
- [ ] 子诉求·标签后置显示：extractTags 按全文匹配位置无关，预计解析层已支持，待端到端验证后回复用户
