import type { RequestEntry } from "@/store/types-request";
import { sharedReads } from "./shared-reads";
import type { AuditCategory, AuditItem } from "./types";

/** A check the audit runs, as it reads once it found nothing. */
interface Check {
  id: string;
  category: AuditCategory;
  /** The findings it makes, by how their ids start. */
  finds: readonly string[];
  title: string;
  description: string;
  /** Whether the requests give it anything to check; any request does when absent. */
  applies?: (requests: readonly RequestEntry[]) => boolean;
  /** What the session adds to the description, when it adds anything. */
  more?: (requests: readonly RequestEntry[]) => string | undefined;
}

const mutations = (requests: readonly RequestEntry[]) =>
  requests.some((r) => r.type === "mutation");
const proxied = (requests: readonly RequestEntry[]) => requests.some((r) => r.mode === "proxy");

/* Each says what its rule measures, so a check passed is a fact about the session. */
const CHECKS: readonly Check[] = [
  {
    id: "pass-n-plus-one",
    category: "performance",
    finds: ["err-n-plus-one-"],
    title: "No N+1 request patterns",
    description: "No list request was followed by requests for its items, one after another.",
  },
  {
    id: "pass-waterfall",
    category: "performance",
    finds: ["warn-waterfall-"],
    title: "No requests in series",
    description: "No chain of requests ran one after another where they could run together.",
  },
  {
    id: "pass-duplicates",
    category: "performance",
    finds: ["warn-duplicate-"],
    title: "No duplicate requests",
    description: "No request was sent again with the same input right after the first.",
    more: sharedReads,
  },
  {
    id: "pass-latency",
    category: "performance",
    finds: ["warn-slow", "err-timeout"],
    title: "Endpoints answer in time",
    description: "Every endpoint's P95 response time is under 1 second.",
  },
  {
    id: "pass-payload-size",
    category: "performance",
    finds: ["err-oversize", "deep-large-request"],
    title: "Payloads are a healthy size",
    description: "No endpoint answers over 1 MB on average, and no request body exceeds 100 KB.",
  },
  {
    id: "pass-error-rate",
    category: "reliability",
    finds: ["err-high-error-rate"],
    title: "Error rates are low",
    description: "No endpoint fails more than 20% of the time.",
  },
  {
    id: "pass-validation",
    category: "reliability",
    finds: ["warn-repeated-validation"],
    title: "No repeated validation failures",
    description: "No validation error came back again and again.",
  },
  {
    id: "pass-response-size",
    category: "reliability",
    finds: ["warn-inconsistent-size"],
    title: "Consistent response sizes",
    description: "Each endpoint's answers keep to a steady size.",
  },
  {
    id: "pass-mutation-retry",
    category: "reliability",
    finds: ["courier-retry-mutation"],
    title: "Retried writes carry an idempotency key",
    applies: mutations,
    description: "No write runs retry middleware without an idempotency key to make a repeat safe.",
  },
  {
    id: "pass-mutation-auth",
    category: "security",
    finds: ["sec-mutation-no-auth"],
    title: "Mutations are authenticated",
    applies: mutations,
    description: "Every mutation observed carried an authentication header.",
  },
  {
    id: "pass-sensitive-url",
    category: "security",
    finds: ["err-sensitive-url"],
    title: "No sensitive data in URLs",
    description: "No token, password or API key was found in a URL's query.",
  },
  {
    id: "pass-server-software",
    category: "security",
    finds: ["sec-server-leak"],
    title: "No server software disclosed",
    description: "No response header names the server software behind it.",
  },
  {
    id: "pass-cookies",
    category: "security",
    finds: ["sec-cookie-forwarding"],
    title: "No cookies forwarded through the proxy",
    applies: proxied,
    description: "No proxied request carried the browser's cookies to the backend.",
  },
  {
    id: "pass-mode",
    category: "best-practices",
    finds: ["courier-mixed-mode"],
    title: "Consistent request modes",
    description: "Each endpoint is called in one mode, direct or proxy.",
  },
  {
    id: "pass-method",
    category: "best-practices",
    finds: ["warn-method-mismatch"],
    title: "Writes are not sent over GET",
    description: "No write goes over GET, whose answers may be cached and repeated.",
  },
];

/**
 * The checks that ran and found nothing, each as a passed item: a check
 * passes once the requests give it something to check — mutations, for
 * the checks of mutations — and none of the findings is its own.
 *
 * @param requests - The completed requests the audit read
 * @param found - What the audit's rules found
 * @returns A passed item for each check that found nothing
 * @example
 * ```ts
 * const items = [...found, ...passedChecks(completed, found)];
 * ```
 */
export function passedChecks(
  requests: readonly RequestEntry[],
  found: readonly AuditItem[],
): AuditItem[] {
  if (requests.length === 0) return [];
  const failed = (check: Check) =>
    found.some((item) => check.finds.some((prefix) => item.id.startsWith(prefix)));
  return CHECKS.filter((check) => (check.applies?.(requests) ?? true) && !failed(check)).map(
    ({ id, category, title, description, more }) => {
      const added = more?.(requests);
      return {
        id,
        severity: "pass",
        category,
        title,
        description: added === undefined ? description : `${description} ${added}`,
      };
    },
  );
}
