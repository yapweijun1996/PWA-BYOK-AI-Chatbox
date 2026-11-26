import { useLayoutEffect, type RefObject } from "react";

export function useConversationAlignment(view: string, conversation: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const pane = conversation.current;
    const main = pane?.parentElement;
    if (view !== "chat" || !pane || !main) return;
    const alignComposer = () => {
      const gutter = pane.offsetWidth - pane.clientWidth;
      main.style.setProperty("--conversation-gutter", `${gutter}px`);
      main.style.setProperty("--conversation-gutter-shift", `${pane.clientLeft - gutter / 2}px`);
    };
    alignComposer();
    const observer = new ResizeObserver(alignComposer);
    observer.observe(pane);
    return () => {
      observer.disconnect();
      main.style.removeProperty("--conversation-gutter");
      main.style.removeProperty("--conversation-gutter-shift");
    };
  }, [view, conversation]);
}
