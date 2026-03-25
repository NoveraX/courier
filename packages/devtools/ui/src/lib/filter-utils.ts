import type { FilterOption } from "@/components/shared/filter-bar";

/** Extract unique string values from an array of objects into FilterOption[] */
export function extractUniqueValues<T>(
  items: readonly T[],
  accessor: (item: T) => string | undefined,
): FilterOption[] {
  const values = new Set<string>();
  for (const item of items) {
    const v = accessor(item);
    if (v) values.add(v);
  }
  return Array.from(values)
    .sort()
    .map((v) => ({ value: v, label: v }));
}

/** Check if a numeric HTTP status code falls into a range bucket (2xx, 3xx, 4xx, 5xx) */
export function matchStatusRange(status: number, range: string): boolean {
  switch (range) {
    case "2xx": return status >= 200 && status < 300;
    case "3xx": return status >= 300 && status < 400;
    case "4xx": return status >= 400 && status < 500;
    case "5xx": return status >= 500;
    default: return false;
  }
}
