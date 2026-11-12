/**
 * The marks Studio's pages show for what the project's `agents` policy
 * decides. Where the MCP server would not start, every endpoint is kept out
 * with the one reason, and the reason quotes the policy as the project
 * wrote it, with no value of the environment in it, nor a credential.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentMarks } from "../src/server/agent-marks";
import { stubOwnEnvironment } from "./helpers/own-environment";

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
    const value = "FAKE-0000-PROBE-VALUE";
    const offer = `${value} token=abc123def`;
    /* What the MCP server says of the policy as it refuses it. */
    const refusal = (quoted: string) =>
      `[courier] agents.offer takes "marked", "reads", "all", not "${quoted}".`;
    stubOwnEnvironment({ AGENT_OFFER: value }, refusal(offer));

    const marks = agentMarks({ sources: { shop }, agents: { offer: offer as never } });

    const kept = {
      offered: false,
      reason: `the MCP server would not start: ${refusal("[redacted] token=[redacted]")}`,
    };
    expect(Object.fromEntries(marks)).toEqual({ "shop.get": kept, "shop.create": kept });
  });
});
