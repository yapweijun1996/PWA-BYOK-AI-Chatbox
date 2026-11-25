export type Language = "system" | "en" | "zh-CN";
export type Locale = "en" | "zh-CN";
export function resolveLanguage(
  preference: Language,
  systemLanguage: string,
): Locale {
  return preference === "system"
    ? systemLanguage.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en"
    : preference;
}
const zh: Record<string, string> = {
  "Expanded message editor": "展开的消息编辑器",
  "Expand message editor": "展开消息编辑器",
  "Close expanded editor": "关闭展开的编辑器",
  "Enter to send · Shift+Enter for a new line": "Enter 发送 · Shift+Enter 换行",
  "Choose images or text files, or drag and drop files here. You can also paste images.": "选择图片或文本文件，也可拖放文件或粘贴图片。",
  "Installing update…": "正在安装更新…",
  "Saving your work and restarting Luma Chat…": "正在保存内容并重新启动 Luma Chat…",
  "An update is ready. Select the update button to install it.": "更新已准备好。点击更新按钮进行安装。",
  "Update paused. Finish the current task and save your work, then try again.": "更新已暂停。请先完成当前任务并保存内容，然后重试。",
  "Update paused. Close other Luma Chat tabs and windows, then try again.": "更新已暂停。请关闭其他 Luma Chat 标签页和窗口，然后重试。",
  "This older update cannot be activated automatically. Close all Luma Chat tabs and windows, then reopen.": "此旧版更新无法自动激活。请关闭所有 Luma Chat 标签页和窗口，然后重新打开。",
  "Could not activate the update. Try again later.": "无法激活更新，请稍后重试。",
  Status: "状态",
  Actions: "操作",
  Update: "更新",
  "Luma Chat": "Luma Chat",
  U: "你",
  You: "你",
  "Thinking…": "思考中…",
  Reasoning: "推理过程",
  "Response inspector": "回复详情",
  "JavaScript tool for next reply": "为下一条回复启用 JavaScript 工具",
  "Local tools for next reply": "为下一条回复启用本地工具",
  "Local tools": "本地工具",
  "Local tools enabled. Results go to the selected provider.": "本地工具已启用，结果会发送给所选服务商。",
  "Local tools disabled.": "本地工具已关闭。",
  "Toggle local tools": "切换本地工具",
  "Enable local JavaScript, time, calculation, file, text and memory tools. Results are sent to the selected model.": "启用本地 JavaScript、时间、计算、文件、文本和记忆工具。结果将发送给所选模型。",
  "Tools": "工具",
  "Local tools disabled for the next reply.": "已为下一条回复关闭本地工具。",
  "Local tools enabled for the next reply. Results go to the selected provider.": "下一条回复已启用本地工具，结果会发送给所选服务商。",
  "Toggle local tools for the next reply": "切换下一条回复的本地工具",
  "Allow the model to run local JavaScript and receive its results for this reply. Requires a tool-capable model.":
    "允许模型在本次回复中运行本地 JavaScript 并接收结果。需要支持工具调用的模型。",
  "JavaScript tool enabled": "已启用 JavaScript 工具",
  "JavaScript tool disabled for the next reply.":
    "已为下一条回复关闭 JavaScript 工具。",
  "JavaScript enabled for the next reply. Code runs locally; results go to the selected provider.":
    "下一条回复已启用 JavaScript。代码在本地执行，结果会发给所选服务商。",
  "Running JavaScript": "正在执行 JavaScript",
  "Running tool": "正在执行工具",
  "Tool input": "工具输入",
  "Invalid or oversized text argument.": "文本参数无效或过长。",
  "File analysis timed out.": "文件分析超时。",
  "File analysis failed.": "文件分析失败。",
  "Invalid tool arguments.": "工具参数无效。",
  "Provide valid ISO dates.": "请输入有效的 ISO 日期。",
  "Provide a valid ISO date.": "请输入有效的 ISO 日期。",
  "Unknown time action.": "未知的时间操作。",
  "Search text must not be empty.": "搜索文本不能为空。",
  "A regular expression is required.": "请输入正则表达式。",
  "Unknown text action.": "未知的文本操作。",
  "Unknown file action.": "未知的文件操作。",
  "Select a unique text, CSV, or JSON attachment from this conversation.": "请从当前对话选择唯一的文本、CSV 或 JSON 附件。",
  "Invalid file offset.": "文件偏移量无效。",
  "Invalid memory offset.": "记忆偏移量无效。",
  "A memory key is required.": "请输入记忆名称。",
  "Unknown memory action.": "未知的记忆操作。",
  "This tool is not available.": "此工具不可用。",
  "CSV has an unclosed quoted field.": "CSV 文件存在未闭合的引号字段。",
  "The tool call limit for this reply was reached.": "本次回复已达到工具调用次数上限。",
  "The tool requires a nonempty code string within the source size limit.": "请输入未超过长度限制的非空代码。",
  "Provide a nonempty script within the source size limit.": "请输入未超过长度限制的非空脚本。",
  "Could not start the JavaScript worker.": "无法启动 JavaScript Worker。",
  "JavaScript runtime did not load in time.": "JavaScript 运行时加载超时。",
  "The JavaScript runtime stopped unexpectedly.": "JavaScript 运行时意外停止。",
  "Could not read the JavaScript worker result.": "无法读取 JavaScript Worker 结果。",
  "Could not send code to the JavaScript worker.": "无法向 JavaScript Worker 发送代码。",
  "Invalid JavaScript source size.": "JavaScript 代码长度无效。",
  "JavaScript runtime initialization or execution failed.": "JavaScript 运行时初始化或执行失败。",
  "Time": "时间",
  "Calculation": "计算",
  "File analysis": "文件分析",
  "Text processing": "文本处理",
  "Local memory": "本地记忆",
  "Local memories": "本地记忆",
  "Memory key": "记忆名称",
  "Memory value": "记忆内容",
  "Save memory": "保存记忆",
  "Memories stay on this device and are available to the model when local tools are enabled. They are not included in backups.": "记忆保存在此设备上，启用本地工具后模型可以读取。记忆不会包含在备份中。",
  "Memory entries stay on this device and are not included in backups. Tool records in chat backups may contain memory values sent to the model.": "记忆条目保存在此设备上，不包含在备份中。对话备份中的工具记录可能包含发送给模型的记忆内容。",
  "Could not read local memories.": "无法读取本地记忆。",
  "Could not save memory. Check the key and value.": "无法保存记忆，请检查名称和内容。",
  "Could not delete memory.": "无法删除记忆。",
  "Permanently delete all local chats, attachments, memories, settings, and saved keys?": "永久删除所有本地对话、附件、记忆、设置和已保存密钥？",
  "Enable local JavaScript, time, calculation, file, text and memory tools for this reply. Results are sent to the selected model.": "为本次回复启用本地 JavaScript、时间、计算、文件、文本和记忆工具。结果将发送给所选模型。",
  Completed: "已完成",
  Failed: "失败",
  "Timed out": "已超时",
  Cancelled: "已取消",
  "Limit reached": "已达到限制",
  "JavaScript source": "JavaScript 源代码",
  "Console output": "控制台输出",
  "Execution result": "执行结果",
  "No return value.": "无返回值。",
  "Execution output was truncated.": "执行输出已截断。",
  "Execution was cancelled.": "执行已取消。",
  "JavaScript execution timed out.": "JavaScript 执行超时。",
  "These metrics describe the most recent model request, not tool execution or earlier requests in this reply.":
    "这些指标仅描述最近一次模型请求，不含工具执行或本次回复中的早期模型请求。",
  "Client measured": "客户端测量",
  "Provider reported": "服务商回传",
  "Local inference — no API charge": "本地推理 — 无 API 费用",
  "Provider timings: generated tokens ÷ generation duration":
    "服务商计时：生成 Token 数 ÷ 生成耗时",
  "Generated tokens": "生成 Token",
  "Generation duration": "生成耗时",
  "Prompt evaluation tokens": "提示词评估 Token",
  "Timing cache tokens": "计时报告中的缓存 Token",
  "Workspace Inspector": "工作区检查器",
  "Inspector sections": "检查器分类",
  "Export snapshot": "导出快照",
  "Export excludes credentials, endpoint addresses, model identifiers, and conversation contents.":
    "导出不包含凭据、服务地址、模型标识或对话内容。",
  "Effective configuration": "当前有效配置",
  "Active request snapshot": "正在进行的请求快照",
  "Historical request snapshot": "历史请求快照",
  "No request snapshot recorded for this response.": "此回复没有记录请求快照。",
  "No telemetry recorded for this response.": "此回复没有记录遥测数据。",
  "Inspect response": "查看回复",
  "Latest response": "最新回复",
  Runtime: "运行状态",
  Context: "上下文",
  Configuration: "配置",
  Telemetry: "遥测",
  Storage: "存储",
  "Request override": "请求覆盖",
  "Conversation override": "对话覆盖",
  "Global settings": "全局设置",
  "Application default": "应用默认值",
  "Request snapshot": "请求快照",
  "Captured at": "捕获时间",
  "Use global model settings": "使用全局模型设置",
  "Default provider": "默认服务商",
  "Set as default provider": "设为默认服务商",
  "Share chat history?": "发送聊天历史？",
  "Sending to {name} will include earlier messages and their attachments.":
    "发送给 {name} 时，此前的消息和附件也会一并发送。",
  "Starting an empty chat sends nothing. Your draft and files stay in the original chat.":
    "新建空白聊天不会发送任何内容。草稿和文件将保留在原聊天中。",
  "Start an empty chat": "新建空白聊天",
  "Send with history": "连同历史一起发送",
  "The chat or its settings changed. Please send again.":
    "聊天或设置已更改，请重新发送。",
  "Use this model for the current chat": "在当前对话使用此模型",
  "Retry with original model": "使用原模型重试",
  "More options": "更多选项",
  "Slash commands": "斜杠命令",
  "Close slash commands": "关闭斜杠命令",
  "Run command": "执行命令",
  "More actions": "更多操作",
  "Open settings from topbar": "从顶栏打开设置",
  "Change language": "切换语言",
  "Change theme": "切换主题",
  "Enter fullscreen": "进入全屏",
  "Exit fullscreen": "退出全屏",
  "Could not change fullscreen mode.": "无法切换全屏模式。",
  "Saving to IndexedDB": "正在保存至 IndexedDB",
  "Last local save failed": "上次本地保存失败",
  "IndexedDB available": "IndexedDB 可用",
  "IndexedDB unavailable": "IndexedDB 不可用",
  "Checking IndexedDB": "正在检查 IndexedDB",
  "Update check idle": "尚未检查更新",
  "Checking": "检查中",
  "Up to date": "已是最新",
  "Update available": "有可用更新",
  "Update failed": "更新检查失败",
  "Offline": "离线",
  "Preparing": "准备中",
  "An update is ready": "更新已就绪",
  "Browser offline": "浏览器离线",
  "Connecting to provider": "正在连接服务商",
  "Last provider request succeeded": "上次服务商请求成功",
  "Model list reachable; chat not checked": "模型列表可访问，聊天尚未验证",
  "Last provider request failed": "上次服务商请求失败",
  "Provider connection not checked": "尚未检查服务商连接",
  "Choose model in topbar": "在顶栏选择模型",
  "Edit": "编辑",
  "Delete": "删除",
  "N/A": "不可用",
  "Toggle JavaScript tool for the next reply": "切换下一条回复的 JavaScript 工具",
  "Usage request mode": "用量回传请求方式",
  "Credential state": "凭据状态",
  "Available for session": "当前会话可用",
  "Saved and locked": "已保存，尚未解锁",
  "Not set": "未设置",
  Redacted: "已隐藏",
  "Connection target": "连接目标",
  "Reasoning support": "支持推理",
  "Provider adapter": "服务商适配器",
  "Provider timings": "服务商计时",
  "Client estimate": "客户端估算",
  Startup: "启动",
  Ready: "就绪",
  "Startup lifecycle": "启动生命周期",
  Browser: "浏览器",
  "Browser online": "浏览器在线",
  "Reply phase": "回复阶段",
  "Reply runtime": "回复运行状态",
  "Reply is in current chat": "当前回复属于此对话",
  "Processing attachments": "正在处理附件",
  "Theme preference": "主题偏好",
  "Effective theme": "当前主题",
  "Language preference": "语言偏好",
  "Effective language": "当前语言",
  "Active conversation": "已选中对话",
  "Workspace session": "当前工作区会话",
  "Messages eligible for request history": "可纳入请求历史的消息",
  "Draft length": "草稿长度",
  "Draft attachments": "草稿附件数",
  "Conversation model override": "对话模型覆盖",
  "Credential store": "凭据存储",
  Repository: "持久化存储",
  Database: "数据库",
  "Database version": "数据库版本",
  "Persisted conversations": "已保存的对话数",
  "Conversations in memory": "内存中的对话数",
  "Buffered draft writes": "缓冲中的草稿写入",
  "Pending repository writes": "进行中的数据库写入",
  "Last write outcome": "最近写入结果",
  "Persistent storage": "已获持久存储权限",
  "Origin usage estimate": "站点用量估计",
  "Origin quota estimate": "站点配额估计",
  "App version": "应用版本",
  "Display mode": "显示模式",
  "Service worker": "Service Worker",
  "Page controlled by worker": "当前页面由 Worker 接管",
  "Checking for updates": "正在检查更新",
  "Service Worker API": "Service Worker API",
  "Update lifecycle": "更新生命周期",
  Yes: "是",
  No: "否",
  "Catalog estimate": "按目录价格估算",
  Provider: "服务商",
  Model: "模型",
  "Served model": "实际响应模型",
  Duration: "耗时",
  "Total duration": "总耗时",
  Tokens: "Token 数",
  "Input tokens": "输入 Token",
  "Output tokens": "输出 Token",
  "Total tokens": "总 Token",
  "Reasoning tokens": "推理 Token",
  "Cached tokens": "缓存 Token",
  Cost: "费用",
  "API cost (USD)": "API 费用（美元）",
  "Reasoning effort": "推理强度",
  "Finish reason": "结束原因",
  Timestamp: "时间戳",
  "Client estimate: reported output tokens ÷ time between first and last generated deltas":
    "客户端估算：回传的输出 Token 数 ÷ 首末生成片段的接收间隔",
  "OpenRouter's reported cost may not include charges from a separate upstream account.":
    "OpenRouter 回传的费用可能不包含上游独立账户的收费。",
  "TTFT starts at the request and ends at the first generated text or reasoning delta. TTFV ends at the first nonblank answer text. Neither measures provider compute time.":
    "TTFT 是从发起请求到收到首段生成文本或推理的时间；TTFV 则到收到首段非空白正文为止。两者都不是服务商的计算耗时。",
  "Gemini reports answer and reasoning tokens separately; output tokens show answer tokens only.":
    "Gemini 分开报告正文和推理 Token；输出 Token 此处仅指正文。",
  "Estimate uses catalog token rates for the selected model, not a billing record.":
    "按所选模型的目录 Token 价格估算，不是账单记录。",
  "New chat": "新对话",
  Today: "今天",
  "Previous 7 days": "过去 7 天",
  Earlier: "更早",
  "No conversations found.": "没有找到对话。",
  "Search chats...": "搜索对话…",
  "Search chats": "搜索对话",
  Workspace: "工作区",
  "Search conversations": "搜索对话",
  "Search scope": "搜索范围",
  Pinned: "置顶",
  Projects: "项目",
  Recent: "最近",
  Archived: "已归档",
  "No pinned conversations.": "没有置顶对话。",
  "No projects yet.": "暂无项目。",
  "No recent conversations.": "没有最近对话。",
  "No archived conversations.": "没有已归档的对话。",
  "Actions for {name}": "{name} 的操作",
  "Project actions for {name}": "项目 {name} 的操作",
  "Conversation actions": "对话操作",
  "Project actions": "项目操作",
  "Rename conversation": "重命名对话",
  Pin: "置顶",
  Unpin: "取消置顶",
  "Move to project": "移至项目",
  "No project": "不归入项目",
  "New project": "新建项目",
  "Rename project": "重命名项目",
  "Project name": "项目名称",
  "Create project": "创建项目",
  "Save changes": "保存更改",
  "A project with this name already exists.": "同名项目已存在。",
  "Archive conversation": "归档对话",
  "Restore from archive": "取消归档",
  "Restore {name}": "恢复 {name}",
  "Delete conversation": "删除对话",
  "Delete project": "删除项目",
  "Move all conversations out before deleting this project.":
    "删除项目前，请先移出其中的所有对话。",
  "Resize sidebar": "调整侧栏宽度",
  "Settings sections": "设置分类",
  Close: "关闭",
  Settings: "设置",
  "Local data": "本地数据",
  Appearance: "外观",
  "Close menu": "关闭菜单",
  "Open menu": "打开菜单",
  "Collapse sidebar": "收起侧栏",
  "Expand sidebar": "展开侧栏",
  "Rename {name}": "重命名 {name}",
  "Remove {name}": "移除 {name}",
  "Delete {name}": "删除 {name}",
  "Starting Luma Chat…": "正在启动 Luma Chat…",
  "Reload app": "重新加载应用",
  "Could not load the app styles. Check your connection and retry.":
    "无法加载应用样式。请检查网络连接并重试。",
  "Startup took too long. If another Luma Chat window is open, close it and retry.":
    "启动超时。如果还有其他 Luma Chat 窗口，请关闭后重试。",
  "Local storage is blocked by another window. Close other Luma Chat windows and retry.":
    "本地存储被另一个窗口阻塞。请关闭其他 Luma Chat 窗口后重试。",
  "Could not open your local data. Check that browser storage is allowed and retry. Your data was not cleared.":
    "无法打开本地数据。请确认浏览器允许存储后重试。数据未被清除。",
  "The app could not display its initial screen. Reload to retry. Your data was not cleared.":
    "应用无法显示初始界面。请重新加载后重试。数据未被清除。",
  "AI providers": "AI 服务商",
  "Choose a model": "选择模型",
  "Choose model": "选择模型",
  "Search models": "搜索模型",
  "Close model selector": "关闭模型选择器",
  "Load models": "加载模型",
  "Loading models…": "正在加载模型…",
  "No models were listed. Enter the model ID in Providers.":
    "没有找到模型，请在服务商设置中输入模型 ID。",
  "No matching models. Clear the search to load another catalog.":
    "没有匹配的模型。清除搜索后可加载其他目录。",
  "Refine your search to see more models.": "请缩小搜索范围以查看更多模型。",
  "Open provider settings": "打开服务商设置",
  "Image input": "图片输入",
  "Ready to send": "可以发送",
  "Setup needed": "需要设置",
  "Local storage": "本地存储",
  "Dismiss message": "关闭提示",
  Conversation: "对话",
  "How can I help you today?": "今天有什么可以帮您？",
  "Your conversations stay on this device. Choose a provider and model to get started.":
    "对话保存在此设备上。请先选择服务商和模型。",
  "Configure a provider": "设置服务商",
  "Start a new chat": "开始新对话",
  "Stopped or interrupted": "已停止或中断",
  "Response failed": "回复失败",
  Retry: "重试",
  Copy: "复制",
  "Preparing attachments…": "正在准备附件…",
  "Image attachment": "图片",
  "Text attachment": "文本",
  "Saving message…": "正在保存消息…",
  "From this tab’s version": "来自本标签页保留的版本",
  "Conversation conflicts": "对话保存冲突",
  "Another tab changed or deleted this conversation. Save this tab’s version as a separate chat to keep its messages, draft and files.":
    "其他标签页已修改或删除此对话。要保留本页的消息、草稿和附件，请另存为新对话。",
  "Recovered copy:": "恢复的副本：",
  "Save a separate copy": "另存为新对话",
  "Separate copy saved locally. The original was not changed.":
    "副本已保存到本机，原对话未改变。",
  "Save a separate copy before sending from this tab.":
    "请先另存为新对话，再从本页发送。",
  "Conversation changed in another tab. This tab did not overwrite it.":
    "其他标签页已更改此对话，本页未覆盖原数据。",
  "These settings changed in another tab. Review the saved settings before trying again.":
    "这些设置已在其他标签页更改。请检查已保存的设置后重试。",
  "Saving reply locally…": "正在将回复保存到本机…",
  "Reply not saved locally.": "回复尚未保存到本机。",
  "Saved locally": "已保存到本机",
  "Retry local save": "重试本地保存",
  "Save the reply locally before sending again.":
    "请先将回复保存到本机，再发送下一条消息。",
  "Archiving conversation…": "正在归档聊天…",
  "Restoring conversation…": "正在恢复聊天…",
  "Conversation archived.": "聊天已归档。",
  "Conversation restored.": "聊天已恢复。",
  "Archive change was not saved. Try again or export before reloading.":
    "归档更改未保存。请重试，或在重新加载前导出备份。",
  "Restore was not saved. Try again.": "恢复更改未保存，请重试。",
  finalizing: "正在保存回复",
  "Stopping…": "正在停止…",
  "This model does not support images in the draft or conversation. Choose an image-capable model or remove draft images.":
    "当前模型无法处理草稿或对话中的图片。请选择支持图片的模型，或移除草稿中的图片。",
  "You are offline. You can keep drafting; reconnect to send to this provider.":
    "当前离线。你可以继续编辑草稿，重新联网后才能发送给该服务商。",
  "Set up a model and provider credentials before sending.":
    "请先设置模型和服务商凭据，再发送消息。",
  "Ask anything...": "输入您的问题…",
  Message: "消息",
  "Attach image or text": "添加图片或文本",
  "Stop generating": "停止生成",
  "Send message": "发送消息",
  "Chats are stored on this device. Content is sent to your selected provider.":
    "对话保存在此设备；发送内容会交给所选服务商。",
  "Back to chat": "返回对话",
  "Connect your own model. Requests go directly from this browser to the selected provider.":
    "连接您自己的模型。请求将由此浏览器直接发送给所选服务商。",
  "Connect to a local or trusted network server.":
    "连接本机或可信网络中的服务。",
  "Use an OpenRouter key to access its model catalog.":
    "使用 OpenRouter Key 访问其模型目录。",
  "Use your own API key and choose a model.":
    "使用您自己的 API Key 并选择模型。",
  "Server base URL": "服务地址",
  "Current server address": "当前服务地址",
  "Edit server address": "编辑服务地址",
  "Apply address": "应用地址",
  "Could not save the server address. Try again.": "无法保存服务地址，请重试。",
  "Backup excludes an invalid LM Studio server address. Set a valid address in AI providers.":
    "备份已排除无效的 LM Studio 服务地址。请在 AI 服务商设置中填写有效地址。",
  "Invalid LM Studio address in backup. Import will keep the current server address.":
    "备份中的 LM Studio 服务地址无效，导入时将保留当前服务地址。",
  "Enable CORS in LM Studio. On a phone, use the computer’s network address; localhost refers to the phone. Browser local-network permission, HTTPS restrictions and firewall settings can affect access. Enable authentication when exposing the server.":
    "请在 LM Studio 中启用 CORS。手机上的 localhost 指手机本身，请填写电脑的网络地址。浏览器本地网络权限、HTTPS 限制和防火墙可能影响连接；开放服务时请启用认证。",
  "Model ID": "模型 ID",
  "Enter a model ID or test connection": "输入模型 ID 或测试连接",
  "This model supports image input": "此模型支持图片输入",
  "Enable only when your selected model supports images. Plain text attachments are sent as text.":
    "仅在模型支持图片时启用；纯文本附件将以文字发送。",
  "Request thought summaries": "请求思考摘要",
  "Request reasoning": "请求推理内容",
  "Enable for models that support thought summaries. Some requests or models return no summary.":
    "仅对支持摘要的模型启用；部分请求或模型不会返回摘要。",
  "Enable for supported models. Reasoning may affect cost, and some models do not expose it.":
    "仅对支持的模型启用；推理可能影响费用，部分模型不提供推理内容。",
  "API token (optional)": "API 令牌（可选）",
  "API key": "API Key",
  Token: "令牌",
  Key: "Key",
  "Keys are accessible to this app while unlocked. Encrypted storage does not protect against malicious scripts or a compromised device. Your provider receives your messages.":
    "解锁期间应用可以访问 Key。加密存储不能防止恶意脚本或设备被入侵；服务商会收到您发送的内容。",
  "Enter key for this session": "输入本次使用的 Key",
  Show: "显示",
  Hide: "隐藏",
  "Save encrypted on this device": "加密保存在此设备",
  "Unlock password": "解锁密码",
  "Enter your password": "输入密码",
  "If you forget the password, the saved key cannot be recovered. Session keys are cleared on reload.":
    "忘记密码后无法恢复保存的 Key；仅本次使用的 Key 会在重新加载后清除。",
  "Use key": "使用 Key",
  "Unlock saved key": "解锁已保存的 Key",
  "Delete saved key": "删除已保存的 Key",
  Lock: "锁定",
  "Test connection": "测试连接",
  "A key or token is available for this session.":
    "本次会话已提供 Key 或令牌。",
  "A saved key is locked.": "已保存的 Key 处于锁定状态。",
  "No key is saved.": "未保存 Key。",
  "Testing requests the model list and may use network resources. A model list does not confirm the key or chat access.":
    "测试会请求模型列表并使用网络；模型列表成功不代表 Key 或聊天权限已验证。",
  "Cloud providers may reject direct browser requests. This app does not include a proxy or server-side key store.":
    "云端服务商可能拒绝浏览器直接请求；此应用不包含代理或服务器端 Key 存储。",
  "Manage your chats, attachments, and browser storage.":
    "管理聊天、附件和浏览器存储。",
  Conversations: "对话",
  Attachments: "附件",
  "Request persistent storage": "请求持久存储",
  Backup: "备份",
  "Export conversations, attachments, and settings. API keys are excluded.":
    "导出对话、附件和设置，不包含 API Key。",
  "Export backup": "导出备份",
  "Import backup": "导入备份",
  "The workspace does not fit in one 100 MiB backup.":
    "整个工作区超过单个备份文件的 100 MiB 上限。",
  "Download each group and import the files one at a time. Each file includes projects and preferences.":
    "请分别下载每组文件，恢复时逐个导入。每个文件均包含项目和偏好设置。",
  "Download group": "下载分组",
  conversations: "个对话",
  "Not backed up: each conversation below exceeds the limit on its own. Its local data has not been changed.":
    "以下对话单独导出也超过上限，未包含在任何备份文件中。本地数据未改变。",
  "Cannot create a restorable backup: invalid workspace records. No data was changed.":
    "工作区中有无效记录，无法创建可恢复的备份。数据未改变。",
  "Backup metadata alone exceeds the file limit. No data was changed.":
    "仅项目和偏好设置就已超过备份文件上限。数据未改变。",
  "Importing backup…": "正在导入备份…",
  "Save the local reply before replacing its conversation, or skip conflicts.":
    "请先在本机保存回复再替换该对话，或选择跳过冲突。",
  "Also import appearance and provider settings": "同时导入外观和服务商设置",
  "A local edit is still saving. Try the import again after it is saved.":
    "本地编辑仍在保存，请在保存后重试导入。",
  "Local data changed since preview. Nothing was imported. Save your work, reload and preview again.":
    "本地数据与预览时不一致，未导入任何内容。请保存当前工作，重新加载并再次预览。",
  "Import failed. Nothing was imported; your existing data and saved keys are unchanged.":
    "导入失败，未写入备份中的任何内容。原有数据和已保存的密钥未改变。",
  "Browser storage can be cleared or evicted. Keep a backup of conversations you need. Data does not automatically sync between devices.":
    "浏览器存储可能被清除，请备份重要对话；数据不会自动跨设备同步。",
  "Import preview": "导入预览",
  "conversations;": "个对话；",
  "have an existing ID. Backups do not contain keys.":
    "个 ID 已存在。备份不包含 Key。",
  "Import and skip conflicts": "导入并跳过冲突",
  "Replace conflicts": "替换冲突项",
  Cancel: "取消",
  "Clear all local data": "清除全部本地数据",
  "No conversations yet.": "暂无对话。",
  "messages ·": "条消息 ·",
  "Choose how Luma Chat looks on this device.":
    "选择此设备上的 Luma Chat 外观。",
  "Language and theme": "语言与主题",
  Theme: "主题",
  System: "跟随系统",
  Light: "浅色",
  Dark: "深色",
  Language: "语言",
  English: "英文",
  "Simplified Chinese": "简体中文",
  "System language": "跟随系统语言",
  "Check for updates": "检查更新",
  "Checking for updates…": "正在检查更新…",
  "Luma Chat is up to date.": "Luma Chat 已是最新版本。",
  "Could not check for updates. Try again later.": "无法检查更新，请稍后重试。",
  "You are offline. Reconnect to check for updates.":
    "当前处于离线状态，请重新连接网络后检查更新。",
  "The app is still preparing offline support. Try again shortly.":
    "应用正在准备离线功能，请稍后重试。",
  "Update checks are unavailable in this build or browser.":
    "当前版本或浏览器不支持检查更新。",
  "An update is ready. Finish any reply, close all Luma Chat tabs and app windows, then reopen. You may need to unlock your key again.":
    "新版本已准备好。请先完成回复，关闭所有 Luma Chat 标签和窗口后重新打开；您可能需要再次解锁 Key。",
  "Delete this conversation and its saved attachments?":
    "删除此对话及其保存的附件？",
  "Conversation name": "对话名称",
  "Start a new chat first.": "请先开始新对话。",
  "Importing preferences will change the LM Studio server:":
    "导入偏好设置将把 LM Studio 服务器更改为：",
  "Invalid server address": "服务器地址无效",
  "Authorize this previously saved token for this server?":
    "是否授权此服务器使用以前保存的令牌？",
  "This token belongs to another server. Restore its address or enter a new token.":
    "此令牌属于另一台服务器。请恢复原地址，或输入新令牌。",
  "Enter a valid server address before using a credential.":
    "请先输入有效的服务器地址，再使用凭据。",
  "Choose a model and enter your key in Providers. LM Studio does not require a key unless authentication is enabled.":
    "请在服务商设置中选择模型并输入 Key。LM Studio 未启用认证时无需 Key。",
  "Enable image support for this model in Providers before sending images.":
    "发送图片前，请先在服务商设置中启用模型图片支持。",
  "Message was not sent because local storage failed. Your draft and attachments are still visible.":
    "本地存储失败，消息未发送；草稿和附件仍保留在界面中。",
  "Choose a model and unlock its key in Providers.":
    "请在服务商设置中选择模型并解锁 Key。",
  "Retry sends a new request to the selected provider and may incur charges. Continue?":
    "重试会向所选服务商发送新请求，可能产生费用。继续吗？",
  "Retry was not sent because local storage failed. The conversation remains visible.":
    "本地存储失败，未发送重试请求；对话仍保留在界面中。",
  "Connecting…": "正在连接…",
  "Model list loaded but no models were listed. This does not verify your key or chat access; enter a model ID manually.":
    "模型列表已加载但没有模型。这不代表 Key 或聊天权限已验证，请手动输入模型 ID。",
  "Enter a key or token first.": "请先输入 Key 或令牌。",
  "Enter an unlock password.": "请输入解锁密码。",
  "Key encrypted and unlocked on this device.":
    "Key 已加密保存在此设备并已解锁。",
  "Key available for this session only.": "Key 仅在本次会话可用。",
  "Key unlocked for this session.": "Key 已在本次会话解锁。",
  "Key locked for this session.": "Key 已在本次会话锁定。",
  "Saved key removed and session locked.": "已删除保存的 Key 并锁定会话。",
  "Could not unlock key. Check your password.": "无法解锁 Key，请检查密码。",
  "Unsupported encrypted key format.": "不支持此加密 Key 格式。",
  "Backup exceeds the 100 MiB file limit.": "备份超过 100 MiB 的文件上限。",
  "Invalid or unsupported backup file.": "备份文件无效或格式不受支持。",
  "Import appearance and provider settings? Saved keys will remain on this device.":
    "导入外观和服务商设置？设备上保存的 Key 将保留。",
  "Replace existing conversations with matching IDs?":
    "替换 ID 相同的现有对话？",
  "Permanently delete all local chats, attachments, settings, and saved keys?":
    "永久删除所有本地对话、附件、设置和保存的 Key？",
  "Other open tabs keep their in-memory drafts and keys. Close them to end those sessions.":
    "其他已打开的标签页仍保留其内存中的草稿和密钥。要结束这些会话，请关闭对应的标签页。",
  "Clearing local data…": "正在清除本地数据…",
  "Could not clear local data. Nothing was deleted. Try again.":
    "未能清除本地数据，没有删除任何内容。请重试。",
  "Local data cleared.": "已清除本地数据。",
  "Copied.": "已复制。",
  "Copy unavailable.": "无法复制。",
  "Copy code": "复制代码",
  "Code copied.": "代码已复制。",
  "Code block": "代码块",
  "Plain text": "纯文本",
  "Message table": "消息表格",
  "Load image": "加载图片",
  "Load image: {name}": "加载图片：{name}",
  "Open image link": "打开图片链接",
  "Loading an image may contact an external server.":
    "加载图片可能会连接外部服务器。",
  "Image unavailable.": "图片无法加载。",
  "Loading image…": "正在加载图片…",
  "Persistent storage is unavailable in this browser.":
    "此浏览器不支持持久存储。",
  "Persistent storage granted.": "已获准使用持久存储。",
  "Persistent storage was not granted; keep backups.":
    "未获准使用持久存储，请保留备份。",
  "Could not request persistent storage.": "无法请求持久存储。",
  Unavailable: "不可用",
  "Authentication failed (HTTP 401). Check this provider's key or token.":
    "认证失败（HTTP 401），请检查此服务商的 Key 或令牌。",
  "Access denied (HTTP 403). Check the provider's account permissions and model access.":
    "访问被拒绝（HTTP 403），请检查账户权限及模型访问权限。",
  "Payment or credit limit reached (HTTP 402). Check the provider account and key limits.":
    "余额不足或达到额度上限（HTTP 402），请检查账户和 Key 限额。",
  "Model or endpoint not found (HTTP 404). Check the provider, model ID, and server address.":
    "找不到模型或接口（HTTP 404），请检查服务商、模型 ID 和地址。",
  "Rate limit or quota exceeded (HTTP 429). Wait or check the provider account.":
    "请求过于频繁或额度已用尽（HTTP 429），请稍后重试或检查账户。",
  "Provider returned an invalid model list.": "服务商返回了无效的模型列表。",
  "Choose or enter a model in Providers.": "请在服务商设置中选择或输入模型。",
  "Enter an API key in Providers.": "请在服务商设置中输入 API Key。",
  "The provider returned an empty response.": "服务商返回了空响应。",
  "The provider returned invalid streaming data. Partial output was retained.":
    "服务商返回了无效的流式数据，已保留部分输出。",
  "The provider reported an error while generating.":
    "服务商在生成过程中报告错误。",
  "The provider reported an error while generating. Partial output was retained.":
    "服务商在生成过程中报告错误，已保留部分输出。",
  "The model reached its output limit. Partial output was retained.":
    "模型达到输出上限，已保留部分输出。",
  "The provider stopped the response due to its content policy. Partial output was retained.":
    "服务商因内容政策停止回复，已保留部分输出。",
  "The provider returned no text. Check model compatibility or safety filters.":
    "服务商没有返回文本，请检查模型兼容性或安全过滤设置。",
  "The response was interrupted before completion. Partial output was retained.":
    "回复在完成前中断，已保留部分输出。",
  "Enter a valid HTTP(S) endpoint without credentials, query, or fragment.":
    "请输入不包含凭据、查询参数或片段的有效 HTTP(S) 地址。",
  "Cloud providers require HTTPS.": "云端服务商必须使用 HTTPS。",
  "Something went wrong.": "发生错误。",
};
export function translate(locale: Locale, text: string): string {
  if (locale === "en") return text;
  const match = text.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match) return text;
  return match[1] + (zh[match[2]] ?? match[2]) + match[3];
}
export function translateNotice(locale: Locale, text: string): string {
  if (locale === "en") return text;
  const timezone = text.match(/^Invalid time zone specified: (.+)$/i);
  if (timezone) return `无效的时区：${timezone[1]}`;
  const catalog = text.match(
    /^Model list loaded \((\d+)\)\. This does not verify your key or chat access\. Select one or enter its ID\.$/,
  );
  if (catalog)
    return `模型列表已加载（${catalog[1]} 个）。这不代表 Key 或聊天权限已验证，请选择或输入模型 ID。`;
  const imported = text.match(/^Imported (\d+) conversations\.$/);
  if (imported) return `已导入 ${imported[1]} 个对话。`;
  const http = text.match(/^Provider returned HTTP (\d+)\.$/);
  if (http) return `服务商返回 HTTP ${http[1]}。`;
  const usage = text.match(/^(.+) used(?: of approximately (.+))?$/);
  if (usage)
    return usage[2]
      ? `已使用 ${usage[1]}，约可用总量 ${usage[2]}`
      : `已使用 ${usage[1]}`;
  const fileType = text.match(/^(.*): use an image or plain text file\.$/);
  if (fileType) return `${fileType[1]}：请选择图片或纯文本文件。`;
  const fileSize = text.match(/^(.*): files must be 5 MB or smaller\.$/);
  if (fileSize) return `${fileSize[1]}：文件不能超过 5 MB。`;
  const unreadableImage = text.match(/^(.*): this image could not be read\.$/);
  if (unreadableImage) return `${unreadableImage[1]}：无法读取此图片。`;
  if (text.startsWith("Connection failed."))
    return text.includes("LM Studio")
      ? "连接失败。请检查 LM Studio 地址、网络、浏览器权限、CORS 和防火墙设置。手机上的 localhost 指手机本身。"
      : "连接失败。请检查网络，以及服务商是否允许浏览器直接请求（CORS）。";
  if (text.startsWith("Storage error:"))
    return "本地存储失败。当前可见内容仍在界面中；请在重新加载前导出备份。";
  return translate(locale, text);
}
export function interpolate(text: string, name: string): string {
  return text.replace("{name}", name);
}
