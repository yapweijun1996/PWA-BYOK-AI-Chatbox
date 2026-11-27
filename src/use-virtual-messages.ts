import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Message } from "./types";
import {
  estimatedMessageHeight,
  virtualMessageRange,
  type VirtualRange,
} from "./virtual-message-layout";

type WindowState = { chatId: string; range: VirtualRange };
type Anchor = { id: string; offset: number };

/** Phase-one windowing. Switching modes begins from a fully mounted list. */
export function useVirtualMessages({
  enabled,
  chatId,
  messages,
  pane,
  content,
  follow,
  searchTarget,
}: {
  enabled: boolean;
  chatId: string;
  messages: readonly Message[];
  pane: RefObject<HTMLElement | null>;
  content: RefObject<HTMLDivElement | null>;
  follow: RefObject<boolean>;
  searchTarget?: { messageId: string; sequence: number };
}) {
  const [state, setState] = useState<WindowState | null>(() => {
    if (!enabled) return null;
    const viewport = typeof window === "undefined" ? 800 : window.innerHeight;
    const initial = messages.map(() => estimatedMessageHeight);
    return {
      chatId,
      range: virtualMessageRange(
        initial,
        follow.current
          ? Math.max(0, initial.length * estimatedMessageHeight - viewport)
          : 0,
        viewport,
      ),
    };
  });
  const heights = useRef(new Map<string, number>());
  const measuredChat = useRef(chatId);
  const lastMessages = useRef(messages);
  const anchor = useRef<Anchor | null>(null);
  const correctedScrollTop = useRef<number | null>(null);
  const positionedSearch = useRef(0);
  const active = enabled;
  const range = state?.chatId === chatId ? state.range : (() => {
    if (!enabled) return { start: 0, end: 0, before: 0, after: 0 };
    const viewport = pane.current?.clientHeight ?? (typeof window === "undefined" ? 800 : window.innerHeight);
    return virtualMessageRange(messages.map(() => estimatedMessageHeight), follow.current ? Math.max(0, messages.length * estimatedMessageHeight - viewport) : 0, viewport);
  })();
  const current = useRef({ enabled, chatId, messages, active });
  current.current = { enabled, chatId, messages, active };

  const captureAnchor = () => {
    const el = pane.current,
      list = content.current;
    if (!el || !list) return;
    const bounds = el.getBoundingClientRect();
    const first = Array.from(
      list.querySelectorAll<HTMLElement>(":scope > [data-message-id]"),
    ).find(
      (row) =>
        row.getBoundingClientRect().bottom > bounds.top &&
        row.getBoundingClientRect().top < bounds.bottom,
    );
    anchor.current = first?.dataset.messageId
      ? {
          id: first.dataset.messageId,
          offset: first.getBoundingClientRect().top - bounds.top,
        }
      : null;
  };
  const restoreAnchor = () => {
    const el = pane.current,
      list = content.current,
      saved = anchor.current;
    if (!el || !list || !saved || follow.current) return;
    const row = Array.from(
      list.querySelectorAll<HTMLElement>(":scope > [data-message-id]"),
    ).find((item) => item.dataset.messageId === saved.id);
    if (row) {
      const correction =
        row.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        saved.offset;
      if (Math.abs(correction) > 0.5) {
        el.scrollTop += correction;
        correctedScrollTop.current = el.scrollTop;
      }
    }
  };
  const measure = () => {
    const list = content.current;
    if (!list) return false;
    let changed = false;
    for (const row of list.querySelectorAll<HTMLElement>(
      ":scope > [data-message-id]",
    )) {
      const id = row.dataset.messageId;
      const height =
        row.getBoundingClientRect().height +
        (parseFloat(getComputedStyle(row).marginBottom) || 0);
      if (
        id &&
        height > 0 &&
        Math.abs((heights.current.get(id) ?? 0) - height) > 0.5
      ) {
        heights.current.set(id, height);
        changed = true;
      }
    }
    return changed;
  };
  const updateRange = () => {
    const el = pane.current,
      list = content.current,
      snapshot = current.current;
    if (!el || !list || !snapshot.enabled) return;
    const origin =
      el.scrollTop +
      list.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      (parseFloat(getComputedStyle(list).paddingTop) || 0);
    const next = virtualMessageRange(
      snapshot.messages.map(
        (message) => heights.current.get(message.id) ?? estimatedMessageHeight,
      ),
      Math.max(0, el.scrollTop - origin),
      el.clientHeight,
    );
    setState((previous) =>
      previous?.chatId === snapshot.chatId &&
      Object.keys(next).every(
        (key) =>
          next[key as keyof VirtualRange] ===
          previous.range[key as keyof VirtualRange],
      )
        ? previous
        : { chatId: snapshot.chatId, range: next },
    );
  };

  useLayoutEffect(() => {
    const messagesChanged = lastMessages.current !== messages;
    lastMessages.current = messages;
    if (measuredChat.current !== chatId) {
      heights.current.clear();
      measuredChat.current = chatId;
      anchor.current = null;
    }
    if (!enabled) {
      if (state) {
        restoreAnchor();
        setState(null);
      }
      return;
    }
    if (!state || state.chatId !== chatId) {
      const initialize = () => {
        if (current.current.enabled) {
          measure();
          captureAnchor();
          updateRange();
        }
      };
      if (!pane.current || !content.current) {
        const frame = requestAnimationFrame(initialize);
        return () => cancelAnimationFrame(frame);
      }
      initialize();
      return;
    }
    if (!pane.current || !content.current) {
      const frame = requestAnimationFrame(() => {
        if (current.current.active) {
          captureAnchor();
          measure();
          updateRange();
        }
      });
      return () => cancelAnimationFrame(frame);
    }
    if (anchor.current) restoreAnchor();
    else captureAnchor();
    if (messagesChanged) updateRange();
  }, [enabled, active, chatId, state, messages, pane, content, follow]);

  useLayoutEffect(() => {
    const el = pane.current, list = content.current;
    if (!enabled || !searchTarget || !el || !list || positionedSearch.current === searchTarget.sequence) return;
    const index = messages.findIndex((message) => message.id === searchTarget.messageId);
    if (index < 0) return;
    positionedSearch.current = searchTarget.sequence;
    follow.current = false;
    anchor.current = null;
    const origin = el.scrollTop + list.getBoundingClientRect().top - el.getBoundingClientRect().top + (parseFloat(getComputedStyle(list).paddingTop) || 0);
    const offset = messages.slice(0, index).reduce((total, message) => total + (heights.current.get(message.id) ?? estimatedMessageHeight), 0);
    el.scrollTop = Math.max(0, origin + offset - el.clientHeight / 2);
    correctedScrollTop.current = el.scrollTop;
    updateRange();
  }, [enabled, chatId, messages, searchTarget, pane, content, follow]);

  useEffect(() => {
    const el = pane.current,
      list = content.current;
    if (!active || !el || !list) return;
    let frame = 0;
    let measuredWidth = list.clientWidth;
    const onScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (Math.abs(list.clientWidth - measuredWidth) > 1) return;
        if (
          correctedScrollTop.current !== null &&
          Math.abs(el.scrollTop - correctedScrollTop.current) <= 1
        )
          correctedScrollTop.current = null;
        else {
          correctedScrollTop.current = null;
          captureAnchor();
        }
        updateRange();
      });
    };
    const invalidate = () => {
      // Offscreen measurements remain estimates until those rows are mounted.
      // Reusing them avoids a large synthetic scroll jump on a width/font change.
      measure();
      restoreAnchor();
      updateRange();
    };
    const observer = new ResizeObserver(() => {
      const widthChanged = Math.abs(list.clientWidth - measuredWidth) > 1;
      if (widthChanged) {
        measuredWidth = list.clientWidth;
        invalidate();
      } else if (measure()) {
        restoreAnchor();
        updateRange();
      }
    });
    observer.observe(list);
    document.fonts?.addEventListener("loadingdone", invalidate);
    for (const row of list.querySelectorAll<HTMLElement>(
      ":scope > [data-message-id]",
    ))
      observer.observe(row);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      document.fonts?.removeEventListener("loadingdone", invalidate);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    active,
    chatId,
    state?.range.start,
    state?.range.end,
    messages,
    pane,
    content,
  ]);

  return active ? { range, heights: messages.map((message) => heights.current.get(message.id) ?? estimatedMessageHeight) } : null;
}
