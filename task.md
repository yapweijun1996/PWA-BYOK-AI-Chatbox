# Luma Chat improvement tasks

## 长对话虚拟化原型

- [x] **第一阶段：实验开关、窗口与锚点。** 仅当前标签页可开启，默认完整渲染；按测量高度与视口计算窗口，支持宽度变化和滚动锚点。搜索定位与消息交互保持虚拟窗口；文本选择暂时使用完整模式，回复关闭实验模式。详见[测量与限制](docs/LONG-CONVERSATION-PERFORMANCE.md#phase-one-prototype)。
- [ ] **第二阶段：搜索与复制。** 已支持窗口化搜索定位与按当前分支复制完整会话；仍需验证无障碍流程与真实设备。
- [ ] **第三阶段：交互状态与实机验证。** 已支持富内容进入窗口，并保留操作过的消息以维持预览及工具卡片；仍需在真实移动设备和屏幕阅读器上验证后再评估默认启用。

## 已修复 · 用户消息换行显示

- [x] **用户气泡保留输入的换行**。输入框中使用 Shift+Enter 或粘贴多行文本后，发送和编辑分支里的用户气泡应按原文显示换行。
  - **现象**：截图中输入框为两行，发送后的用户气泡显示为一行。
  - **原因与修复**：发送和编辑保留原始文本；用户消息的 Markdown 普通单换行以前显示为空格。现在只在用户消息渲染时转换软换行，AI 回复继续使用原有 Markdown 行为。
  - **验收**：单换行、多次换行、空行及长行在桌面和手机气泡中正确显示；刷新、复制、编辑、切换分支后原始文本保持一致；回复的 Markdown、代码块和表格行为保持正常。
  - **入口**：[消息渲染](src/App.tsx) · [Markdown 渲染](src/components/RichMessage.tsx) · [发送及编辑](src/use-workspace.ts)。

## Browser-first Agent tasks

以下任务待实施。首版以 CSV 和表格分析为重点。P0-1 至 P0-5 通过后开放 CSV 分析。 [产品目标](goal.md) · [架构方案](docs/BROWSER-FIRST-AGENT.md) · [输入、输出与交互规格](docs/COMPOSER-CSV.md)

依赖顺序为 P0-2 的工具权限与数据范围 → P0-1 的任务循环 → P0-3 的保存及恢复 → P0-4 的 Composer 状态 → P0-5 的 CSV 端到端验收。联网工具和文件访问工作区也需在各自开放前完成下方权限及设备验收。用户消息换行问题在本清单上方单独跟踪。

- [ ] **P0-1 · 任务循环和预算**。用现有工具循环和服务商适配器处理原生函数调用，首个有效 CSV 调用触发任务。记录模型轮次、工具尝试、时间、终止原因和分轮用量。
  - **验收**：使用模拟服务商完成多轮 CSV 汇总；首条模型请求计入预算；达到限额后不再发起新调用；取消传播到请求与 Worker；普通聊天仍使用原有工具上限。
  - **入口**：[工具循环](src/tool-turn.ts) · [请求与增量保存](src/use-workspace.ts) · [工具协议](src/provider-tools.ts)。
- [ ] **P0-2 · 工具注册与文件授权**。校验工具参数、选中文件或授权目录与目标服务商。文件工作区操作遵循已选权限级别，CSV 分析沿用只读输入。
  - **验收**：未知工具、无效参数、未选附件和 CSV 任务中的记忆请求在执行前被拒绝；CSV 源文件和未获准数据不出现在任何 CSV 分析请求中；切换收件服务商后须重新确认数据范围。
  - **入口**：[本地工具](src/local-tools.ts) · [沙箱协议](src/js-tool-runtime/protocol.ts)。
- [ ] **P0-3 · 分支检查点与恢复**。保存运行、顺序事件和检查点，关联会话修订与所有权代号。恢复时重查服务商、资源和预算；产物记录与生成回执原子提交。
  - **验收**：刷新后等待用户继续；复用已经提交的产物；并发面板只允许一个标签页提交；失去所有权、删除分支或清空数据后，迟到的响应不能重建任务。
  - **入口**：[IndexedDB](src/storage.ts) · [分支投影](src/branches.ts) · [旧数据恢复](src/data-contracts.ts)。
- [ ] **P0-4 · Composer 工具菜单和运行状态**。在「＋ → 工具」管理 CSV 分析，保持统一的聊天入口。复用工具卡片，展示文件范围、预算、暂停、停止、恢复及保存失败。
  - **验收**：工具默认开启，已持久化的关闭选择在升级和重启后保留；关闭总开关时所有工具不发送给模型，重新开启后恢复各会话的单项选择。未选文件时不提供 CSV 工具；模型仅返回文本时不创建任务。关闭工具时已选本地文件不会变成上传附件。工具菜单可用键盘操作；桌面和窄屏均可看清步骤并停止，三种界面语言齐全。
  - **入口**：[Composer](src/components/Composer.tsx) · [工具卡片](src/components/ToolExecutionCard.tsx) · [PWA 更新](src/pwa-update.ts)。
- [ ] **P0-5 · CSV 校验、预览和下载**。在 Worker 解析选中的文件，预览列映射及无效记录，使用精确十进制计算月度汇总。预览与下载共用一份汇总结果。
  - **验收**：CSV 默认本地分析；列唯一匹配自动继续，映射存在歧义时等待确认。单文件上限为 5 MiB、50,000 条数据记录、100 列；上限内可处理，超过任一上限即停止并提示拆分，不生成不完整结果。固定样例覆盖 BOM、中文表头、引号内换行、无效日期和精确小数。错误可定位，跳过无效记录须明确选择。预览和下载数据一致，由用户主动下载；桌面和手机可用，已安装 PWA 离线可查看已提交产物。构建和 GitHub Pages 子路径回归通过。
- [ ] **P1 · 上下文与后续能力**。在当前分支记录摘要范围，区分报告、估算和未知用量。另行评估本地记忆权限。
  - **验收**：摘要源改动后失效；历史工具调用对不被截断；摘要调用纳入任务预算。
- [ ] **权限级别设计**。实现默认「操作前询问」和用户主动选择的「完全访问」。联网工具默认可用，授权目录支持文件创建、修改与删除。界面区分应用授权和浏览器实际提供的文件及网络能力。
  - **验收**：新用户及旧配置默认询问；切换完全访问前显示实际能力和浏览器授权范围；选择在本设备持久保存且可撤销；收紧权限立即阻止后续动作；受支持浏览器与不支持目录 API 的设备分别验证。
- [ ] **Browser-first 联网工具**。实现默认可用的网页读取和按配置提供的搜索工具，复用工具总开关和权限选择。 [设计与验收](docs/BROWSER-NETWORK-TOOLS.md)
  - **验收**：询问模式拒绝后不发送请求；完全访问遵循浏览器可用范围；CORS 不可读、跳转、超时、截断和取消均有明确结果；联网记录和诊断不暴露凭据。
- [ ] **文件访问工作区**。支持选择单文件或授权目录，目录操作遵循权限模式；不支持目录 API 的设备提供单文件与下载流程。 [设计与验收](docs/BROWSER-FILE-ACCESS.md)
  - **验收**：目录访问不能越界；创建、覆盖、修改和删除分别展示目标、预览与状态；默认询问模式拒绝或关闭预览不会写入；目标变化时提示冲突；执行前检查权限及文件版本，说明检查和提交之间仍可能发生外部变更。结果不明的写入不会自动重放。按 [移动端实机验证清单](docs/MOBILE-DEVICE-CHECKLIST.md) 分别记录 iOS 和 Android 的浏览器与安装模式。
- [ ] **P2 · 扩展评估**。以实际任务对比受限工具扩展和单 Agent 的成本、可靠性与浏览器兼容性。

## Historical reliability tasks

Tasks 1–5 were committed at `2d73183`; tasks 6 and 7 complete the implementation of this plan. The regression cases for these changes have not been run locally, and CI and deployment status have not been checked.

These tasks are from the source review at `e813fa0`. LM Studio credential binding to the approved server base URL is already implemented; preserve it rather than rebuilding it. See the [feature map](FEATURE-MAP.md) for current behavior and the [issue backlog](docs/ISSUE-BACKLOG.md) for the referenced `LC-*` tickets.

## First changes

- [x] **1. Keep unapproved server addresses out of storage and backups.** Keep the address being edited separate from the saved LM Studio endpoint. Apply it only after validation with `providerBaseUrl`. Export explicitly selected settings fields and omit invalid legacy endpoints with a notice.
  - **Done when:** Cancel leaves the approved destination and credential unchanged. An address containing credentials, a query, or a fragment is neither persisted by the form nor emitted by the backup writer. Valid custom base paths still round-trip.
  - **Start in:** [provider settings UI](src/App.tsx), [settings and export actions](src/use-workspace.ts), [URL validation](src/providers.ts).

- [x] **2. Separate browsing providers from choosing a message recipient.** Give Settings its own selected tab. Change the global provider only through an explicit selection. Before the first send of existing local history to a cloud destination, offer to continue with history or start an empty chat.
  - **Done when:** Viewing another provider's settings and returning to chat does not change where the next message goes. Cancelling a destination change sends nothing; starting fresh sends no previous messages or attachments.
  - **Start in:** [provider tabs](src/App.tsx), [workspace actions](src/use-workspace.ts), [configuration resolution](src/request-config.ts).

- [x] **3. Distinguish a finished operation from a committed save.** Keep streamed text visible immediately, but track the final reply write and the archive write through transaction completion.
  - **Done when:** A delayed write is not presented as saved. If it fails, the reply remains available or the archive action remains recoverable. Retrying the local save does not send a second provider request.
  - **Start in:** `runReply`, `organizeChat` and `queueSave` in [the workspace controller](src/use-workspace.ts); [IndexedDB transactions](src/storage.ts).

## Recovery and offline use

- [x] **4. Make backups restorable (LC-03, LC-05).** Share a serialized-byte limit between import and export; offer smaller exports or explain when a single conversation cannot fit. Validate IDs and attachment metadata, resolve conflicts and preference choices up front, then commit the selected conversations and settings together.
  - **Done when:** Every export offered as restorable fits the importer. A failed import leaves the previous workspace and local vault unchanged. Older v1 backups still load. Import checks records against the preview inside its transaction and assigns new device-local revisions.

- [x] **5. Prevent stale writes across tabs (LC-04).** Check the expected conversation revision in the write transaction. Apply settings changes without replacing unrelated fields from a stale snapshot.
  - **Done when:** A stale tab cannot silently overwrite newer messages or recreate a deleted chat. Its unsaved draft can be kept as a copy. Changing a theme cannot restore an old provider configuration.

- [x] **6. Keep the offline shell paired with its assets (LC-06).** Treat each installed HTML shell and its precached assets as one version. Limit cache cleanup to the service worker's own registration scope.
  - **Done when:** An interrupted update leaves the previously installed build usable offline. Updating one Pages subpath does not delete another's cache or force a reload during a reply.
  - **Coverage written (not run):** the [update harness](tests/update-smoke.mjs) serves the production output as A and distinct HTML/JS/CSS as fixture B. It exercises wrong bytes, a disconnected install, natural activation, draft recovery and an independent same-origin registration.

- [x] **7. Clear transient state when clearing local data.** Reset credential and password inputs and dismiss any import preview. Ignore completions from unlock or import operations started before the clear.
  - **Done when:** After clearing, returning to Settings shows no previous credential input or pending import. A late operation cannot unlock a key or repopulate cleared chats.
  - **Coverage written (not run):** [clear-data browser cases](tests/clear-data.mjs) hold crypto results, a backup read, a mocked catalog and the real deletion transaction. They cover cancel, rollback, successful reset and a fresh explicit import.

Keep direct browser-to-provider requests, per-conversation drafts, and v1 backup compatibility throughout. A chat backup contains private content; it is not a shareable diagnostic export.
