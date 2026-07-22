"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";

export function ClickableMessageRow({
  href,
  label,
  children
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function openMessage() {
    router.push(href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMessage();
    }
  }

  return (
    <tr
      aria-label={label}
      className="clickable-table-row"
      onClick={openMessage}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      {children}
    </tr>
  );
}
