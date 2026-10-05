import { studioToken } from "@/lib/studio-token";
import type { StudioInfo } from "@/store/studio-info";

/**
 * Whether this page visits a public demo: Studio says it serves one, and
 * the page holds no token. A visitor's clears stay in its page, its
 * Playground history is its own, and it is told it is in a demo.
 *
 * @param info - What Studio told the page of itself, or `null` before it has
 * @returns Whether the page is one of the demo's visitors
 * @example
 * ```ts
 * if (!isDemoVisitor(useStudioStore.getState().studioInfo)) getSocket().emit("requests:clear", { keep });
 * ```
 */
export function isDemoVisitor(info: StudioInfo | null): boolean {
  return info?.demo !== undefined && studioToken() === null;
}
