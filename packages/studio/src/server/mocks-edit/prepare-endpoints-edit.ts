import { realpathSync } from "node:fs";
import { isRecord } from "@noverax/courier-cli/devkit";

import type { LoadedCourierConfig } from "../config-loader";
import { describeEntry } from "../mock-manager/describe-entry";
import { sha256Hex } from "../sha256-hex";
import { checkLoadedState } from "./check-loaded-state";
import type { EditIntent } from "./edit-intent";
import { type ExistingMocksTarget, inspectMocksTarget } from "./inspect-mocks-target";
import { manualOutcomeOf } from "./manual-outcome";
import type { MocksEditContext } from "./mocks-edit-context";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { type EndpointsPlan, planEndpointsEdit } from "./plan/plan-endpoints-edit";
import { quoteString } from "./plan/quote-string";
import type { PreparedEdit } from "./prepare-edit";
import { keptProblem, loadedFileProblem } from "./rejection-of";
import { restartWarning } from "./restart-warning";
import { type LoadState, runningState } from "./running-state";
import type { InvalidOutcome, ManualOutcome } from "./types";
import type { EndpointsBody } from "./validate-endpoints-body";

/**
 * Plan adding endpoints to the list a mock answers, or say why Studio will
 * not. Only an endpoint the mock leaves to its source's server can be added
 * — one of its source that its list does not name — and the file is
 * planned only when Studio runs exactly what is on disk, as an edit that
 * declares mocks is.
 *
 * @param ctx - The running Studio
 * @param state - What it runs now
 * @param body - The mock and the endpoints, checked in shape
 * @returns The prepared edit, the field that cannot be as asked, or the reason to add them by hand
 * @example
 * ```ts
 * const prepared = await prepareEndpointsEdit(ctx, view, { key: "shop", endpoints: ["orders.refund"], baseHash: null, planDigest: null });
 * ```
 */
export async function prepareEndpointsEdit(
  ctx: MocksEditContext,
  state: LoadState,
  body: EndpointsBody,
): Promise<PreparedEdit | InvalidOutcome | ManualOutcome> {
  const root = realpathSync(ctx.projectRoot);
  let named: string | null = null;
  try {
    const loaded = runningState(state, root);
    const target = inspectMocksTarget(root);
    if (target.kind !== "existing") {
      throw new MocksEditRefusal(
        "MOCK_NOT_FOUND",
        `There is no mocks file that declares ${body.key}.`,
      );
    }
    named = target.relative;
    checkLoadedState(loaded, target);
    const invalid = await invalidEndpoints(loaded, body, root);
    if (invalid !== null) return invalid;
    const existing = { name: target.name, text: target.text };
    const plan = planEndpointsEdit({ existing, key: body.key, add: body.endpoints });
    return {
      status: "prepared",
      root,
      loaded,
      target,
      plan: { text: plan.text, edits: plan.edits, creates: false },
      formatting: null,
      baseHash: target.hash,
      planDigest: sha256Hex(plan.text),
      intent: endpointsIntent(target, body, plan, root),
    };
  } catch (err) {
    if (!(err instanceof MocksEditRefusal)) throw err;
    return manualOutcomeOf(err, { target: named, creates: false, snippet: endpointsSnippet(body) });
  }
}

/**
 * The endpoints to add by hand: the names, quoted, to append to the mock's
 * `endpoints` array.
 *
 * @param body - The mock and the endpoints
 * @returns The snippet
 */
export function endpointsSnippet({ key, endpoints }: EndpointsBody): string {
  const names = endpoints.map((name) => `  ${quoteString(name, '"')},`);
  return [`// Add to the endpoints of ${key} in its defineMockServer({ ... }):`, ...names].join(
    "\n",
  );
}

/*
 * Only an endpoint the mock leaves to its source's server can be added: one
 * of its source that its list does not name. A mock with no list answers
 * them all already. The source's endpoints are the routes its description
 * lists, named as `endpoints` names them.
 */
async function invalidEndpoints(
  loaded: LoadedCourierConfig,
  { key, endpoints }: EndpointsBody,
  root: string,
): Promise<InvalidOutcome | null> {
  const invalid = (field: "key" | "endpoints", message: string): InvalidOutcome => ({
    status: "invalid",
    errors: [{ index: 0, source: sourceKeyOf(loaded, key), field, message }],
  });
  const entry = Object.hasOwn(loaded.mocks.entries, key) ? loaded.mocks.entries[key] : undefined;
  if (entry === undefined) return invalid("key", `The mocks file declares no mock ${key}.`);
  const described = await describeEntry(key, entry, root);
  if ("problem" in described) return invalid("key", described.problem);
  const listed: readonly unknown[] | undefined =
    isRecord(entry) && Array.isArray(entry.endpoints) ? entry.endpoints : undefined;
  if (listed === undefined) {
    return invalid("endpoints", `${key} answers every endpoint of its source already.`);
  }
  const ofSource = new Set(
    described.description.routes.map((route) =>
      route.group ? `${route.group}.${route.endpoint}` : route.endpoint,
    ),
  );
  const refused = endpoints.find((name) => !ofSource.has(name) || listed.includes(name));
  if (refused === undefined) return null;
  return invalid(
    "endpoints",
    ofSource.has(refused)
      ? `${key} answers ${refused} already.`
      : `${refused} is not an endpoint of the source ${key} serves.`,
  );
}

/* The key under `sources` the mock serves, for the page to name it; "" when it serves none the config declares. */
function sourceKeyOf(loaded: LoadedCourierConfig, key: string): string {
  const entry = Object.hasOwn(loaded.mocks.entries, key) ? loaded.mocks.entries[key] : undefined;
  const served = isRecord(entry) ? entry.source : undefined;
  return Object.entries(loaded.config.sources).find(([, source]) => source === served)?.[0] ?? "";
}

function endpointsIntent(
  target: ExistingMocksTarget,
  body: EndpointsBody,
  plan: EndpointsPlan,
  root: string,
): EditIntent {
  const added = plan.after.slice(plan.before.length);
  return {
    keys: [body.key],
    snippet: endpointsSnippet(body),
    did: `added ${added.join(", ")} to the endpoints of ${body.key} in`,
    rejection: (before, after) =>
      loadedFileProblem(after, target.path, root) ??
      listProblem(after, body.key, plan.after) ??
      keptProblem(before, after),
    warnings: async (restarting) => restartWarning(restarting),
  };
}

/* The mock, loaded again, lists the endpoints the edit meant, in order. */
function listProblem(
  after: LoadedCourierConfig,
  key: string,
  meant: readonly string[],
): string | null {
  const entry = Object.hasOwn(after.mocks.entries, key) ? after.mocks.entries[key] : undefined;
  if (!isRecord(entry) || entry.__type !== "courier-mock-server") {
    return `${key} is not a defineMockServer() definition after the edit`;
  }
  const listed: readonly unknown[] = Array.isArray(entry.endpoints) ? entry.endpoints : [];
  if (listed.length === meant.length && listed.every((name, at) => name === meant[at])) return null;
  return `${key} does not list the endpoints the edit meant`;
}
