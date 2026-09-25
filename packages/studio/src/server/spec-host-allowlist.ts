import { ACT_BUDGET_MS } from "./project-state/budgets";
import type { ConfigFailure, FreshSnapshot, ProjectReads } from "./project-state/types";

/**
 * What the project says about the private hosts Studio may fetch a
 * specification from, as Studio runs it once caught up with the disk.
 *
 * - `listed` — courier.config loads; `hosts` is its `studio.allowedSpecHosts`.
 * - `missing` — there is no courier.config in `root`, so no host is named.
 * - `failing` — courier.config does not load, so the list cannot be read.
 * - `starting` / `reloading` — a load is still under way.
 */
export type SpecHosts =
  | { readonly state: "listed"; readonly hosts: readonly string[] }
  | { readonly state: "missing"; readonly root: string }
  | { readonly state: "failing"; readonly failure: ConfigFailure }
  | { readonly state: "starting" | "reloading" };

/** Read what the project allows, once for the request that asks however often it asks. */
export type SpecHostAllowlist = () => Promise<SpecHosts>;

/**
 * The private hosts one request may fetch a specification from.
 *
 * Nothing is read until the request asks — a fetch asks only for an address
 * it would otherwise refuse as private, so a public host, or this machine
 * when the developer asked for it, never reads the project. This machine
 * reached through a redirect from another host is asked about like a
 * private one. The first ask waits for Studio to catch up with the saves
 * already on disk, for as long as a request that acts on the project
 * waits: a host removed or added by a save just before the request counts.
 * Every later ask of the same request — each import a check of all of them
 * fetches — gets that one answer.
 *
 * The list comes only from a config that loads now. While courier.config
 * fails, the last one that loaded is not used: a save that removed a host
 * and broke the config would otherwise keep that host allowed for as long as
 * the config stays broken.
 *
 * @param project - The project Studio runs
 * @param root - The project root, symlinks resolved
 * @returns The allowlist of one request
 *
 * @example
 * ```ts
 * const raw = await fetchSpec(url, specHostAllowlist(project, root));
 * ```
 */
export function specHostAllowlist(project: ProjectReads, root: string): SpecHostAllowlist {
  let answer: Promise<SpecHosts> | undefined;
  return () => {
    answer ??= project.fresh(ACT_BUDGET_MS).then((view) => specHostsOf(view, root));
    return answer;
  };
}

function specHostsOf(view: FreshSnapshot, root: string): SpecHosts {
  if (view.starting) return { state: "starting" };
  if (view.settling) return { state: "reloading" };
  const { failure } = view;
  if (failure?.code === "CONFIG_NOT_FOUND") return { state: "missing", root };
  if (failure) return { state: "failing", failure };
  /* An outcome with no failure always ran a config; this only keeps the types honest. */
  if (view.running === null) return { state: "starting" };
  const hosts: unknown = view.running.config.studio?.allowedSpecHosts;
  if (!Array.isArray(hosts)) return { state: "listed", hosts: [] };
  return {
    state: "listed",
    hosts: hosts.filter((host: unknown): host is string => typeof host === "string"),
  };
}
