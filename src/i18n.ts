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
  "Luma Chat": "Luma Chat",
  U: "你",
  You: "你",
  "Thinking…": "思考中…",
  Reasoning: "推理过程",
  "New chat": "新对话",
  Today: "今天",
  "Previous 7 days": "过去 7 天",
  Earlier: "更早",
  "No conversations found.": "没有找到对话。",
  "Search chats...": "搜索对话…",
  "Search chats": "搜索对话",
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
  "Loading Luma Chat…": "正在加载 Luma Chat…",
  "AI providers": "AI 服务商",
  "Choose a model": "选择模型",
  "Choose model": "选择模型",
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
  Theme: "主题",
  System: "跟随系统",
  Light: "浅色",
  Dark: "深色",
  Language: "语言",
  English: "英文",
  "Simplified Chinese": "简体中文",
  "System language": "跟随系统语言",
  "An update is ready. Finish any reply, close all Luma Chat tabs and app windows, then reopen. You may need to unlock your key again.":
    "新版本已准备好。请先完成回复，关闭所有 Luma Chat 标签和窗口后重新打开；您可能需要再次解锁 Key。",
  "Delete this conversation and its saved attachments?":
    "删除此对话及其保存的附件？",
  "Conversation name": "对话名称",
  "Start a new chat first.": "请先开始新对话。",
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
  "Backup exceeds the 100 MB import limit.": "备份超过 100 MB 导入上限。",
  "Invalid or unsupported backup file.": "备份文件无效或格式不受支持。",
  "Import appearance and provider settings? Saved keys will remain on this device.":
    "导入外观和服务商设置？设备上保存的 Key 将保留。",
  "Replace existing conversations with matching IDs?":
    "替换 ID 相同的现有对话？",
  "Permanently delete all local chats, attachments, settings, and saved keys?":
    "永久删除所有本地对话、附件、设置和保存的 Key？",
  "Local data cleared.": "已清除本地数据。",
  "Copied.": "已复制。",
  "Copy unavailable.": "无法复制。",
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
