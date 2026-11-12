/**
 * The marks Studio's pages show for what the project's `agents` policy
 * decides. Where the MCP server would not start, every endpoint is kept out
 * with the one reason, and the reason quotes the policy as the project
 * wrote it, with no value of the environment in it, nor a credential.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentMarks } from "../src/server/agent-marks";

const { endpoint } = courier();

const shop = defineApi({
  name: "shop",
  baseURL: "https://shop.example",
  endpoints: { get: endpoint.get("orders/:id"), create: endpoint.post("orders") },
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the marks of a policy the MCP server would not start with", () => {
  it("keep every endpoint out, saying why with no value of the environment, nor a credential", () => {
    vi.stubEnv("AGENT_OFFER", "FAKE-0000-PROBE-VALUE");
    const offer = `${process.env.AGENT_OFFER} token=abc123def`;

    const marks = agentMarks({ sources: { shop }, agents: { offer: offer as never } });

    const kept = {
      offered: false,
      reason:
        'the MCP server would not start: [courier] agents.offer takes "marked", "reads", "all", not "[redacted] token=[redacted]".',
    };
    expect(Object.fromEntries(marks)).toEqual({ "shop.get": kept, "shop.create": kept });
  });
});
