"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function LocalDateTime({ value }: { value: Date | string | number }) {
  const date = new Date(value);
  const isoValue = Number.isNaN(date.getTime()) ? "" : date.toISOString();
  const fallback = isoValue ? `${isoValue.slice(0, 10)} ${isoValue.slice(11, 16)} UTC` : "-";
  const formatted = useSyncExternalStore(
    subscribe,
    () => formatInBrowserTimeZone(date),
    () => fallback
  );

  return <time dateTime={isoValue || undefined} title={isoValue || undefined}>{formatted}</time>;
}

function formatInBrowserTimeZone(date: Date) {
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}
