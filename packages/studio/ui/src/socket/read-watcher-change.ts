import type { StudioState } from "@/store/store-types";
import { isPlainObject } from "./is-plain-object";

type WatcherChange = NonNullable<StudioState["watcherLastChange"]>;

/**
 * A `watcher:change` payload, or `null` when it is not one: a change the
 * watcher saw in the API sources or in a mock, the names it concerns, and
 * when.
 *
 * @param data - The payload, as the socket parsed it
 * @returns The change, or `null`
 * @example
 * ```ts
 * readWatcherChange({ source: "mock", files: ["petstore"], timestamp: 1 }); // → the change
 * readWatcherChange({ source: "disk" }); // → null
 * ```
 */
export function readWatcherChange(data: unknown): WatcherChange | null {
  if (!isPlainObject(data)) return null;
  const { source, files, timestamp } = data;
  if (source !== "api" && source !== "mock") return null;
  if (!Array.isArray(files) || typeof timestamp !== "number") return null;
  const names: unknown[] = files;
  if (!names.every((name): name is string => typeof name === "string")) return null;
  return { source, files: names, timestamp };
}
