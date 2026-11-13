/**
 * The Courier snippets write a request's names and values as code reads
 * them: each name of the call's path as a property, in brackets where it is
 * no identifier, the variables as JSON written as code — a key with a
 * quote in it and a `__proto__` key kept as keys — and a webhook's address
 * as a string. Run as written, the code makes the call the request was.
 * The values are made up; nothing is sent.
 */
import { describe, expect, it } from "vitest";
import { requestSnippet } from "@/features/requests/request-snippets";
import type { RequestEntry } from "@/store";
import { AWKWARD, expectNothingEndsTheCode, runCode } from "./awkward-text";
import { requestEntry } from "./request-entry-fixture";

/* Variables with keys that are no identifiers, one an object literal reads as the prototype's. */
const VARIABLES: unknown = JSON.parse(
  `{"note":${JSON.stringify(AWKWARD)},"x\\"y":1,"my-key":2,"__proto__":{"kept":true}}`,
);
/* An address as a URL parser keeps it: a quote in the host. */
const ADDRESS = 'http://we"ird/webhooks/stripe';

interface Call {
  path: string[];
  args: unknown[];
}

/* A caller that takes any path of names, and keeps each call made on it; none is a promise. */
function recordingCaller(calls: Call[]): unknown {
  const at = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_target, name) => (name === "then" ? undefined : at([...path, String(name)])),
      apply: (_target, _this, args: unknown[]) => {
        calls.push({ path, args });
        return Promise.resolve("done");
      },
    });
  return at([]);
}

function call(fields: Partial<RequestEntry>): RequestEntry {
  return requestEntry({ group: "billing.invoices", method: "get-user", ...fields });
}

describe("the Courier snippet of a call", () => {
  it("calls the endpoint by each name of its path, with the variables it was given", async () => {
    const calls: Call[] = [];
    const { code } = requestSnippet(call({ variables: VARIABLES }), "courier");

    await runCode(code, { caller: recordingCaller(calls) });

    expect(calls.map((c) => c.path)).toEqual([["billing", "invoices", "get-user"]]);
    expect(JSON.stringify(calls[0]?.args)).toBe(JSON.stringify([VARIABLES]));
    expectNothingEndsTheCode(code);
  });

  it("calls it by the same names with the whole body when the body was too large to show", async () => {
    const calls: Call[] = [];
    const { code } = requestSnippet(call({ variables: undefined, variablesCutFrom: 9 }), "courier");

    await runCode(code, { caller: recordingCaller(calls), wholeBody: { all: true } });

    expect(calls).toEqual([{ path: ["billing", "invoices", "get-user"], args: [{ all: true }] }]);
  });
});

describe("the Courier snippet of a webhook delivered", () => {
  it("delivers the same body to the address it went to", async () => {
    const delivered: unknown[][] = [];
    const webhook = requestEntry({
      mode: "webhook",
      source: "stripe",
      group: undefined,
      method: "invoice.paid",
      url: ADDRESS,
      variables: VARIABLES,
    });
    const [importLine, ...rest] = requestSnippet(webhook, "courier").code.split("\n");

    await runCode(rest.join("\n"), {
      stripe: "the stripe webhook",
      deliverWebhook: async (...args: unknown[]) => delivered.push(args),
    });

    expect(importLine).toBe('import { deliverWebhook } from "@noverax/courier-mock"');
    expect(delivered).toHaveLength(1);
    const [named, options] = (delivered[0] ?? []) as [unknown, { to?: string; body?: unknown }?];
    expect(named).toBe("the stripe webhook");
    expect(options?.to).toBe(ADDRESS);
    expect(JSON.stringify(options?.body)).toBe(JSON.stringify(VARIABLES));
    expectNothingEndsTheCode(rest.join("\n"));
  });

  it("names a webhook no variable can be named after as `webhook`", async () => {
    const delivered: unknown[][] = [];
    const webhook = requestEntry({
      mode: "webhook",
      source: "class",
      group: undefined,
      url: ADDRESS,
    });
    const [, ...rest] = requestSnippet(webhook, "courier").code.split("\n");

    await runCode(rest.join("\n"), {
      webhook: "the class webhook",
      deliverWebhook: async (...args: unknown[]) => delivered.push(args),
    });

    expect(delivered.map(([named]) => named)).toEqual(["the class webhook"]);
  });
});
