/**
 * The policy a project's server runs by: read from the config as it stands,
 * narrowed where the server started, checked again only when a reload
 * brings a new one — and kept as it was when a reload brings a broken one.
 */
import type { CourierConfig } from "@noverax/courier/config";
import { describe, expect, it } from "vitest";

import { projectPolicy } from "../../src/project/project-policy";

function project(agents: unknown): CourierConfig {
  return { sources: {}, agents } as CourierConfig;
}

describe("a project's policy", () => {
  it("is the config's, narrowed by the server's start, and the same object until the config changes", () => {
    let config = project({ offer: "reads", access: "write" });
    const policy = projectPolicy(() => config, { readOnly: true });

    const first = policy();
    expect(first).toMatchObject({ offer: "reads", access: "read" });
    expect(policy()).toBe(first);

    config = project({ offer: "all" });
    expect(policy()).toMatchObject({ offer: "all", access: "read" });
  });

  it("stops the server at its start for a policy it cannot decide by", () => {
    const policy = projectPolicy(() => project({ offer: "everything" }), {});

    expect(() => policy()).toThrow(expect.objectContaining({ code: "AGENT_POLICY_INVALID" }));
  });

  it("keeps the last good policy when a reload brings a broken one", () => {
    let config = project({ offer: "reads" });
    const policy = projectPolicy(() => config, {});
    const good = policy();

    config = project({ ofer: "all" });

    expect(policy()).toBe(good);
    expect(policy()).toBe(good);
  });

  it("offers the marked endpoints alone when there is no config, or no policy in it", () => {
    expect(projectPolicy(() => undefined, {})()).toMatchObject({ offer: "marked" });
    expect(projectPolicy(() => project(undefined), {})()).toMatchObject({ offer: "marked" });
  });
});
