import type { BindingSnapshot } from "@/store/types-ui";

/** A runtime attached to Studio, as the sidebar names it. */
export interface AttachedApp {
  id: string;
  kind: "browser" | "server";
  /** Where the app is served, without the scheme: `localhost:5173`. */
  origin: string | undefined;
}

function hostOf(origin: string): string {
  return origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * The apps attached to Studio, each with the origin it is served at: the one
 * the runtime said, else the one a source bound to it carries.
 *
 * @param snapshot - Studio's last account of the runtimes and their bindings
 * @returns The apps, in the order Studio lists the runtimes
 * @example
 * ```ts
 * attachedApps(useStudioStore.getState().bindingSnapshot);
 * // → [{ id: "vite-browser", kind: "browser", origin: "localhost:5173" }]
 * ```
 */
export function attachedApps(snapshot: BindingSnapshot): AttachedApp[] {
  return snapshot.runtimes.map(({ runtimeId, kind, origin: said }) => {
    const origin =
      said ?? snapshot.rows.find((row) => row.runtimeId === runtimeId && row.appOrigin)?.appOrigin;
    return { id: runtimeId, kind, origin: origin === undefined ? undefined : hostOf(origin) };
  });
}
