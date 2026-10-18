/**
 * A call whose variables the input schema refused was never sent: its
 * Response tab — the Playground's too — its status in the Playground and
 * the Variables editor's line say so, with what the schema said of the
 * first field it refused, where they said the server had answered with an
 * empty body, that a schema mismatched, and that the variables were valid.
 */
import { describe, expect, it } from "vitest";

import { editorCheckOf } from "@/features/playground/editor-check";
import { playgroundCells } from "@/features/playground/playground-cells";
import { requestView, responseView } from "@/features/requests/payload-view";
import { applyEvents } from "@/store/apply-events";
import type { EventType, RequestEntry } from "@/store/types";
import type { CatalogEndpoint, PlaygroundHistoryEntry } from "@/store/types-ui";
import { requestEntry } from "./request-entry-fixture";

const CATEGORY = 'Invalid option: expected one of "audio"|"desk"';

/* The call as its events report it: started, its variables refused, failed with 422. */
function refusedCall(...more: Array<{ message: string; path: string[] }>): RequestEntry {
  const at = (type: EventType, fields: Record<string, unknown>, step: number) => ({
    id: "r1",
    type,
    requestId: "r1",
    sessionId: "app",
    timestamp: 1_000 + step,
    ...fields,
  });
  const issues = [{ message: CATEGORY, path: ["category"] }, ...more];
  const events = [
    at("request:start", { source: "shop", group: "products", method: "list" }, 0),
    at("validation:fail", { target: "variables", issues }, 1),
    at("request:error", { error: { type: "validation", message: "Validation failed" } }, 2),
  ];
  const { requests } = applyEvents([], events, {
    maxRequests: 10,
    ignorePatterns: [],
    paused: false,
  });
  const [call] = requests;
  if (!call) throw new Error("the call was not kept");
  return call;
}

const RUN: PlaygroundHistoryEntry = {
  id: "e1",
  rid: "r1",
  source: "shop",
  group: "products",
  method: "list",
  variables: '{\n  "category": ""\n}',
  headers: "{}",
  mode: "proxy",
  timestamp: 1_000,
  status: "error",
  statusCode: 422,
};

const LIST: CatalogEndpoint = {
  type: "query",
  hasVariablesSchema: true,
  hasResponseSchema: false,
  origin: "runtime",
  variablesFields: [{ path: "category", type: '"audio" | "desk"', required: false }],
};

describe("a call the input schema refused", () => {
  it("says in its Response tab it was not sent, and what the schema said of the first field", () => {
    expect(responseView(refusedCall()).empty).toEqual({
      title: "Not sent",
      detail: `The variables broke the input schema, so nothing was sent. category — ${CATEGORY}`,
    });
    expect(responseView(refusedCall({ message: "Too big", path: ["limit"] })).empty?.detail).toBe(
      `The variables broke the input schema, so nothing was sent. category — ${CATEGORY}, and 1 more the Request tab marks`,
    );
  });

  it("has each field the schema refused marked in its Request tab, as its Response tab says", () => {
    const view = requestView(refusedCall({ message: "Too big", path: ["limit"] }));

    expect(view.chips).toContainEqual({ label: "refused by the schema", tone: "err" });
    expect([...view.issues.keys()]).toEqual(["category", "limit"]);
  });

  it("reads variables refused in the Playground's status, where an answer that broke its schema reads schema mismatch", () => {
    const broken = requestEntry({
      status: "validation_error",
      validated: { variables: "passed", response: "failed" },
    });

    expect(
      playgroundCells({ entry: RUN, row: refusedCall(), now: 2_000, slowMs: 500 })[0],
    ).toMatchObject({ label: "Status · variables refused", value: "422" });
    expect(playgroundCells({ entry: RUN, row: broken, now: 2_000, slowMs: 500 })[0]?.label).toBe(
      "Status · schema mismatch",
    );
  });

  it("keeps the editor's line on the refusal while it holds the variables refused, however laid out", () => {
    const issues = refusedCall().error?.validationIssues ?? [];
    const editors = (variables: string) => ({
      tab: "variables" as const,
      variables,
      headers: "{}",
      asForm: false,
    });
    const refusal = { variables: RUN.variables, issues };

    expect(editorCheckOf(editors('{"category":""}'), LIST, "products.list", refusal)).toEqual({
      tone: "err",
      label: `Refused by the input schema · category — ${CATEGORY}`,
    });
    expect(
      editorCheckOf(editors('{ "category": "desk" }'), LIST, "products.list", refusal),
    ).toEqual({
      tone: "ok",
      label: "Valid · every field products.list requires is set",
    });
    expect(
      editorCheckOf({ ...editors(RUN.variables), tab: "headers" }, LIST, "products.list", refusal)
        .label,
    ).toBe("Valid JSON · sent with the call");
  });
});
