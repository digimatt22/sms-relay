"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ConversationThread({ children }: { children: ReactNode }) {
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    const selected = thread?.querySelector<HTMLElement>("[data-selected-message='true']");
    if (!thread || !selected) return;
    const remainingHeight = thread.scrollHeight - selected.offsetTop - selected.offsetHeight;
    const bottomSpace = Math.max(4, thread.clientHeight - selected.offsetHeight - remainingHeight);
    thread.style.paddingBottom = `${bottomSpace}px`;
    thread.scrollTop = selected.offsetTop - 4;
  }, []);

  return <div className="conversation-thread" ref={threadRef}>{children}</div>;
}
