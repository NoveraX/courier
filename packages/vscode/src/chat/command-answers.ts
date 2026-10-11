import * as vscode from "vscode";

import { rangeOf, siteLocation } from "../code/ranges";
import { auditPage, endpointPage, requestPage } from "../studio/studio-pages";
import type { EndpointName, EndpointStats } from "../studio/studio-types";
import { auditFacts, endpointFacts, failureFacts, statusFacts } from "./chat-facts";
import type { ChatAsk } from "./chat-types";

/* The call sites an answer links to, past which Studio's Called from tab lists them. */
const MOST_SITES = 5;

/**
 * `/status`: how every endpoint is doing.
 *
 * @param ask - The request and what answers it
 * @example
 * ```ts
 * await statusAnswer(ask);
 * ```
 */
export async function statusAnswer({ studio, stats, stream, now }: ChatAsk): Promise<void> {
  stream.markdown(statusFacts(stats, now));
  stream.button({ command: "courier.openStudioPage", arguments: [studio], title: "Open Studio" });
}

/**
 * `/failures`: the latest failed requests, the latest one a click away in
 * Studio's inspector.
 *
 * @param ask - The request and what answers it
 * @example
 * ```ts
 * await failuresAnswer(ask);
 * ```
 */
export async function failuresAnswer({ deps, studio, stream, now }: ChatAsk): Promise<void> {
  const failures = await deps.fetchRequests(studio, { failed: true, limit: 20 });
  stream.markdown(failureFacts(failures, now));
  const [latest] = failures;
  if (!latest) return;
  const page = requestPage(studio, latest.id);
  stream.button({ command: "courier.openStudioPage", arguments: [page], title: "Open the latest" });
  stream.button({
    command: "courier.requests.showFailed",
    title: "List them in the Requests view",
  });
}

/**
 * `/audit`: what the audit found in the requests, gravest first.
 *
 * @param ask - The request and what answers it
 * @example
 * ```ts
 * await auditAnswer(ask);
 * ```
 */
export async function auditAnswer({ deps, studio, stream }: ChatAsk): Promise<void> {
  stream.markdown(auditFacts(await deps.fetchFindings(studio)));
  const page = auditPage(studio);
  stream.button({ command: "courier.openStudioPage", arguments: [page], title: "Open the Audit" });
}

/**
 * `/endpoint`: one endpoint — the one named, or the one the cursor is on —
 * its figures and latest calls, linked to its declaration and the places
 * that call it.
 *
 * @param ask - The request and what answers it
 * @example
 * ```ts
 * await endpointAnswer(ask);
 * ```
 */
export async function endpointAnswer(ask: ChatAsk): Promise<void> {
  const { deps, studio, stats, request, stream, now } = ask;
  const asked = request.prompt.trim().replace(/^`|`$/g, "");
  const found = asked ? namedIn(stats, asked) : await inFront(ask);
  if (!found) {
    stream.markdown(
      asked
        ? `No endpoint is called \`${asked.replace(/`/g, "")}\`: name one as \`source.group.endpoint\` or \`group.endpoint\`.`
        : "Name an endpoint — `source.group.endpoint` — or put the cursor on a call to one.",
    );
    return;
  }
  const { source, endpoint } = found;
  const requests = await deps.fetchRequests(studio, { source, endpoint, limit: 5 });
  stream.markdown(endpointFacts(found, requests, now));
  const declared = (await deps.definitionsFor(studio)).find(
    (each) => each.source === source && each.endpoint === endpoint,
  );
  if (declared) {
    stream.reference(new vscode.Location(vscode.Uri.file(declared.path), rangeOf(declared.span)));
  }
  const sites = await deps.fetchSites(studio, source, endpoint);
  for (const site of sites.slice(0, MOST_SITES)) stream.reference(siteLocation(site));
  const page = endpointPage(studio, source, endpoint);
  stream.button({ command: "courier.openStudioPage", arguments: [page], title: "Open in Studio" });
}

/**
 * The endpoint a name means: `source.group.endpoint`, or `group.endpoint`
 * of any source.
 *
 * @param stats - Every endpoint's figures
 * @param name - The name
 * @returns The endpoint's figures, or `undefined` when no endpoint is called so
 * @example
 * ```ts
 * namedIn(stats, "orders.place"); // shop's orders.place
 * ```
 */
export function namedIn(stats: readonly EndpointStats[], name: string): EndpointStats | undefined {
  return (
    stats.find((each) => `${each.source}.${each.endpoint}` === name) ??
    stats.find((each) => each.endpoint === name)
  );
}

async function inFront({ deps, stats }: ChatAsk): Promise<EndpointStats | undefined> {
  const named: EndpointName | undefined = await deps.endpointInFront();
  return (
    named && stats.find((each) => each.source === named.source && each.endpoint === named.endpoint)
  );
}
