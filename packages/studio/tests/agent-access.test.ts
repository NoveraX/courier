/**
 * What a change does to the tools agents may call, as `courier-studio diff`
 * reports it: the tools it adds, those it keeps from agents, those offered
 * differently — and where the MCP server would not start at all.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { agentChanges, agentSurfaceOf } from "../src/commands/diff/agent-access";
import {
  agentAccessMarkdown,
  agentAccessText,
  changesAgentAccess,
} from "../src/commands/diff/agent-access-report";

const { endpoint } = courier();

const shop = defineApi({
  name: "shop",
  baseURL: "https://shop.example",
  endpoints: {
    get: endpoint.get("orders/:id"),
    create: endpoint.post("orders"),
    cancel: endpoint.del("orders/:id").agent({ description: "Cancel", access: "destructive" }),
  },
});

describe("what agents may call, before and after a change", () => {
  it("is what the policy offers, each tool with its access and what offered it", () => {
    expect(agentSurfaceOf({ sources: { shop }, agents: { offer: "reads" } })).toEqual({
      tools: [
        { path: "shop.get", tool: "get", access: "read", confirm: false, reason: 'offer: "reads"' },
        {
          path: "shop.cancel",
          tool: "cancel",
          access: "destructive",
          confirm: true,
          reason: "marked .agent()",
        },
      ],
    });
    expect(agentSurfaceOf({ sources: { shop }, agents: { offer: "nothing" as never } })).toEqual({
      problem: expect.stringContaining("agents.offer"),
    });
  });

  it("lists the tools added, kept from agents and offered differently", () => {
    const before = agentSurfaceOf({ sources: { shop }, agents: { offer: "reads" } });
    const after = agentSurfaceOf({
      sources: { shop },
      agents: { offer: "all", deny: ["shop.get"], confirm: "write" },
    });

    const changes = agentChanges(before, after);

    expect(changes.added.map((tool) => tool.path)).toEqual(["shop.create"]);
    expect(changes.removed.map((tool) => tool.path)).toEqual(["shop.get"]);
    expect(changes.changed).toEqual([]);
    expect(changesAgentAccess(changes)).toBe(true);
    expect(agentAccessText(changes)).toBe(
      [
        "Agent access: 1 tool added, 1 tool kept from agents: agents may call 2 tools",
        '  + shop.create  create  write, a person confirms  offer: "all"',
        "  - shop.get  get  read",
        "",
      ].join("\n"),
    );
    expect(agentAccessMarkdown(changes)).toContain(
      '| Added | `shop.create` | `create` | write, a person confirms | offer: "all" |',
    );
  });

  it("says when a tool is offered under another access, and when nothing changed", () => {
    const before = agentSurfaceOf({ sources: { shop }, agents: { offer: "all" } });
    const after = agentSurfaceOf({ sources: { shop }, agents: { offer: "all", confirm: "write" } });

    const changes = agentChanges(before, after);
    const same = agentChanges(before, before);

    expect(agentAccessText(changes)).toContain(
      "  ~ shop.create  create  write → write, a person confirms",
    );
    expect(changesAgentAccess(same)).toBe(false);
    expect(agentAccessText(same)).toBe("Agent access: no change: agents may call 3 tools\n");
  });

  it("says where the server would not start, and lists nothing as added against a base that records nothing", () => {
    const broken = agentSurfaceOf({ sources: { shop }, agents: { access: "admin" as never } });
    const head = agentSurfaceOf({ sources: { shop } });

    expect(agentAccessText(agentChanges(head, broken))).toContain(
      "  ! The MCP server would not start after the change: [courier] agents.access takes",
    );
    expect(agentChanges(undefined, head)).toMatchObject({
      added: [],
      offered: 1,
      baseRecorded: false,
    });
  });
});
