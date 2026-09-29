/**
 * The private hosts one request may fetch a specification from: read from
 * the project once Studio has caught up with the disk, once per request, and
 * only from a config that loads now — never from the last one that loaded.
 */
import { describe, expect, it, vi } from "vitest";

import type { LoadedCourierConfig } from "../src/server/config-loader";
import { ACT_BUDGET_MS } from "../src/server/project-state/budgets";
import type { ConfigFailure, FreshSnapshot, ProjectReads } from "../src/server/project-state/types";
import { specHostAllowlist } from "../src/server/spec-host-allowlist";

/* Only what the allowlist reads of a loaded project; the entries need not be strings. */
function running(allowedSpecHosts: unknown): LoadedCourierConfig {
  return { config: { sources: {}, studio: { allowedSpecHosts } } } as never;
}

function failure(code: ConfigFailure["code"]): ConfigFailure {
  return { code, message: "courier.config.ts: boom", at: 1, cause: new Error("boom") };
}

const LOADED: FreshSnapshot = {
  revision: 1,
  starting: false,
  running: running(["gitlab.internal", 7, "10.0.0.7:8080"]),
  loadedAt: 1,
  failure: null,
  settling: false,
};

function projectAt(view: FreshSnapshot) {
  const fresh = vi.fn(async (_budgetMs: number) => view);
  const project: ProjectReads = { snapshot: () => view, fresh };
  return { project, fresh };
}

describe("specHostAllowlist", () => {
  it("reads nothing until the request asks", () => {
    const { project, fresh } = projectAt(LOADED);

    specHostAllowlist(project, "/work/app");

    expect(fresh).not.toHaveBeenCalled();
  });

  it("reads the project once however often one request asks, as a request that acts waits", async () => {
    const { project, fresh } = projectAt(LOADED);
    const allowlist = specHostAllowlist(project, "/work/app");

    const answers = await Promise.all([allowlist(), allowlist(), allowlist()]);

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(fresh).toHaveBeenCalledWith(ACT_BUDGET_MS);
    expect(answers).toEqual([
      { state: "listed", hosts: ["gitlab.internal", "10.0.0.7:8080"] },
      { state: "listed", hosts: ["gitlab.internal", "10.0.0.7:8080"] },
      { state: "listed", hosts: ["gitlab.internal", "10.0.0.7:8080"] },
    ]);
  });

  it("lists nothing for a config that names no host, or names them in something other than a list", async () => {
    for (const named of [undefined, "gitlab.internal"]) {
      const { project } = projectAt({ ...LOADED, running: running(named) });

      expect(await specHostAllowlist(project, "/work/app")()).toEqual({
        state: "listed",
        hosts: [],
      });
    }
  });

  it("does not use the last good list while courier.config fails", async () => {
    const failed = failure("UNKNOWN");
    const { project } = projectAt({ ...LOADED, failure: failed });

    expect(await specHostAllowlist(project, "/work/app")()).toEqual({
      state: "failing",
      failure: failed,
    });
  });

  it("names the root for a project whose courier.config is gone, and uses no list it had", async () => {
    const { project } = projectAt({ ...LOADED, failure: failure("CONFIG_NOT_FOUND") });

    expect(await specHostAllowlist(project, "/work/app")()).toEqual({
      state: "missing",
      root: "/work/app",
    });
  });

  it("says Studio is starting before the first load has an outcome", async () => {
    const { project } = projectAt({ ...LOADED, revision: 0, starting: true, running: null });

    expect(await specHostAllowlist(project, "/work/app")()).toEqual({ state: "starting" });
  });

  it("says courier.config is reloading when Studio could not catch up within the budget", async () => {
    const { project } = projectAt({ ...LOADED, settling: true });

    expect(await specHostAllowlist(project, "/work/app")()).toEqual({ state: "reloading" });
  });
});
