const DAY = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days === 0) return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: "long" });
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export type DateBucket = "Today" | "Yesterday" | "Previous 7 Days" | "Previous 30 Days" | "Older";

export function dateBucket(ts: number, now = Date.now()): DateBucket {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 Days";
  if (days < 30) return "Previous 30 Days";
  return "Older";
}

/** Groups items into ordered date buckets, preserving input order within each bucket. */
export function groupByDate<T>(
  items: T[],
  getTime: (item: T) => number,
  now = Date.now(),
): { bucket: DateBucket; items: T[] }[] {
  const order: DateBucket[] = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"];
  const map = new Map<DateBucket, T[]>();
  for (const item of items) {
    const bucket = dateBucket(getTime(item), now);
    map.set(bucket, [...(map.get(bucket) ?? []), item]);
  }
  return order.filter((b) => map.has(b)).map((bucket) => ({ bucket, items: map.get(bucket)! }));
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
