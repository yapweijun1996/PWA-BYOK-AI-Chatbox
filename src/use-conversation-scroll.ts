import { useLayoutEffect, useRef } from "react";
import type { WorkspaceView } from "./settings-sections";

export function useConversationScroll(active: string, view: WorkspaceView, hasMessages: boolean) {
  const messagesContent = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLElement>(null);
  const lastScrollTop = useRef(0);
  const followReply = useRef(true);
  useLayoutEffect(() => {
    const pane = conversation.current;
    const content = messagesContent.current;
    if (view !== "chat" || !hasMessages || !pane || !content) return;
    const keepBottom = () => {
      if (followReply.current) pane.scrollTop = pane.scrollHeight;
      lastScrollTop.current = pane.scrollTop;
    };
    keepBottom();
    const observer = new ResizeObserver(keepBottom);
    observer.observe(content);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [active, view, hasMessages]);
  const onMessageScroll = () => {
    const el = conversation.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap <= 2) followReply.current = true;
    else if (el.scrollTop !== lastScrollTop.current)
      followReply.current = false;
    lastScrollTop.current = el.scrollTop;
  };
  return { messagesContent, conversation, followReply, onMessageScroll };
}
