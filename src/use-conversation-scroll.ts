import { useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceView } from "./settings-sections";

export function useConversationScroll(active: string, view: WorkspaceView, hasMessages: boolean) {
  const messagesContent = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLElement>(null);
  const lastScrollTop = useRef(0);
  const followReply = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  useLayoutEffect(() => {
    const pane = conversation.current;
    const content = messagesContent.current;
    if (view !== "chat" || !hasMessages || !pane || !content) { setShowJumpToLatest(false); return; }
    const keepBottom = () => {
      if (followReply.current) pane.scrollTop = pane.scrollHeight;
      lastScrollTop.current = pane.scrollTop;
      setShowJumpToLatest(!followReply.current && pane.scrollHeight - pane.scrollTop - pane.clientHeight > 2);
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
    // Layout changes can dispatch downward scroll events before ResizeObserver
    // catches up. Only moving away from the tail signals an intent to stop.
    else if (el.scrollTop < lastScrollTop.current - 1)
      followReply.current = false;
    if (gap <= 2 || el.scrollTop >= lastScrollTop.current || lastScrollTop.current - el.scrollTop > 1) lastScrollTop.current = el.scrollTop;
    setShowJumpToLatest(!followReply.current && gap > 2);
  };
  const jumpToLatest = () => {
    const el = conversation.current;
    if (!el) return;
    followReply.current = true;
    el.scrollTop = el.scrollHeight;
    lastScrollTop.current = el.scrollTop;
    setShowJumpToLatest(false);
    el.focus({ preventScroll: true });
  };
  return { messagesContent, conversation, followReply, onMessageScroll, showJumpToLatest, jumpToLatest };
}
