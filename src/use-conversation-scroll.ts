import { useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceView } from "./settings-sections";

export function useConversationScroll(active: string, view: WorkspaceView, hasMessages: boolean, replying: boolean) {
  const messagesContent = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLElement>(null);
  const lastScrollTop = useRef(0);
  const userScrollIntentUntil = useRef(0);
  const followFrame = useRef<number | null>(null);
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
    return () => { observer.disconnect(); if (followFrame.current !== null) cancelAnimationFrame(followFrame.current); followFrame.current = null; };
  }, [active, view, hasMessages]);
  const onMessageScroll = () => {
    const el = conversation.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const recentIntent = performance.now() <= userScrollIntentUntil.current;
    if (gap <= 2) followReply.current = true;
    // While a reply is arriving, layout corrections can also move scrollTop.
    // Otherwise, honor programmatic navigation as well as user input.
    else if ((recentIntent || !replying) && el.scrollTop < lastScrollTop.current - 1)
      followReply.current = false;
    if (replying && gap > 2 && followReply.current && !recentIntent && followFrame.current === null) {
      followFrame.current = requestAnimationFrame(() => {
        followFrame.current = null;
        if (conversation.current !== el || !followReply.current || performance.now() <= userScrollIntentUntil.current) return;
        el.scrollTop = el.scrollHeight;
        lastScrollTop.current = el.scrollTop;
      });
    }
    if (gap <= 2 || el.scrollTop >= lastScrollTop.current || lastScrollTop.current - el.scrollTop > 1) lastScrollTop.current = el.scrollTop;
    setShowJumpToLatest(!followReply.current && gap > 2);
  };
  const markScrollIntent = () => { userScrollIntentUntil.current = performance.now() + 1200; if (followFrame.current !== null) cancelAnimationFrame(followFrame.current); followFrame.current = null; };
  const jumpToLatest = () => {
    const el = conversation.current;
    if (!el) return;
    followReply.current = true;
    el.scrollTop = el.scrollHeight;
    lastScrollTop.current = el.scrollTop;
    setShowJumpToLatest(false);
    el.focus({ preventScroll: true });
  };
  return { messagesContent, conversation, followReply, onMessageScroll, markScrollIntent, showJumpToLatest, jumpToLatest };
}
