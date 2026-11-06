import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/source/parse-source";
import { isNode, nameOf, programOf, walk } from "../../../src/upgrade/codemod/ast";
import { courierHeadOf } from "../../../src/upgrade/codemod/courier-heads";

/* The head each call of a method starts from, in the file's order. */
function headsOf(text: string, method: string) {
  const parsed = parseSource("file.ts", text);
  if (parsed.problem !== null) throw new Error(parsed.problem.message);
  const program = programOf(parsed.program);
  const heads: unknown[] = [];
  walk(program, ({ node }) => {
    const { callee } = node;
    if (node.type !== "CallExpression" || !isNode(callee) || callee.type !== "MemberExpression")
      return;
    if (nameOf(callee.property) === method) heads.push(courierHeadOf(program, callee.object));
  });
  return heads;
}

describe("courierHeadOf", () => {
  it("traces a chain to the head courier() returned, through a base, its extend() and a const holding the chain", () => {
    const heads = headsOf(
      `import { courier } from "@noverax/courier/define";
const { endpoint, stream: events } = courier();
const cached = courier({ middleware: [] });
const admin = cached.extend({ prefix: "admin" });
const { endpoint: adminEndpoint } = admin.extend({});
const users = endpoint.get("users").variables<{ page: number }>();
endpoint.get("a").mark();
events.via((sse) => sse.get("events")).mark();
cached.endpoint.get("b").mark();
(cached).channel.via((ws) => ws.connect("room")).mark();
adminEndpoint.post("c").mark();
courier().endpoint.get("d").mark();
users.mark();
`,
      "mark",
    );

    expect(heads).toEqual([
      "endpoint",
      "stream",
      "endpoint",
      "channel",
      "endpoint",
      "endpoint",
      "endpoint",
    ]);
  });

  it("traces nothing the file does not say for certain", () => {
    expect(
      headsOf(
        `import { courier } from "@noverax/courier/define";
let { endpoint } = courier();
const base = courier();
let reused = base;
endpoint.get("a").mark();
reused.endpoint.get("b").mark();
somethingElse.get("c").mark();
base[name].get("d").mark();
`,
        "mark",
      ),
    ).toEqual([undefined, undefined, undefined, undefined]);
    expect(
      headsOf(
        `import { courier } from "@noverax/courier/define";
const { endpoint } = courier();
function define(endpoint: Builder) {
  return endpoint.get("a").mark();
}
endpoint.get("b").mark();
`,
        "mark",
      ),
    ).toEqual([undefined, undefined]);
    expect(
      headsOf(
        `import { courier } from "./courier";
import type { courier as typed } from "@noverax/courier/define";
const { endpoint } = courier();
endpoint.get("a").mark();
`,
        "mark",
      ),
    ).toEqual([undefined]);
  });
});
