import type { Message } from "./types";

export async function copyMessage(
  message: Message,
  notify: (text: string) => void,
) {
  try {
    await navigator.clipboard.writeText(message.content);
    notify("Copied.");
  } catch {
    notify("Copy unavailable.");
  }
}

// Preserve ordinary partial selection within one answer or expanded reasoning.
// A selection of whole bubbles copies their Markdown, never their surrounding UI.
export function copyConversationSelection(
  event: ClipboardEvent,
  list: HTMLElement,
  messages: readonly Message[],
) {
  const selection = window.getSelection();
  if (
    event.defaultPrevented ||
    !event.clipboardData ||
    !selection?.rangeCount ||
    selection.isCollapsed ||
    !list.contains(selection.anchorNode) ||
    !list.contains(selection.focusNode)
  )
    return;
  const range = selection.getRangeAt(0);
  const selected = Array.from(
    list.querySelectorAll<HTMLElement>("[data-message-id]"),
  ).filter((article) => range.intersectsNode(article));
  if (selected.length === 1) {
    const answer = selected[0].querySelector(".message-answer");
    const reasoning = selected[0].querySelector(".reasoning .rich-message");
    const containsRange = (node: Element | null) =>
      node?.contains(range.startContainer) && node.contains(range.endContainer);
    if (containsRange(answer) || containsRange(reasoning)) return;
  }
  const byId = new Map(
    messages.map((message) => [message.id, message.content]),
  );
  const markdown = selected
    .map((article) => byId.get(article.dataset.messageId ?? ""))
    .filter(Boolean)
    .join("\n\n");
  if (selected.length) {
    event.clipboardData.setData("text/plain", markdown);
    event.preventDefault();
  }
}
