import { codeString } from "@/lib/snippet-values";
import { wholeBodyNote } from "@/lib/snippets";
import { courierArgs } from "./courier-args";
import { requestBodyFile } from "./request-body-file";
import type { SnippetRequest } from "./request-snippets";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/* The names a module's code can give no variable: its reserved words, and the two strict code binds nothing to. */
const RESERVED = new Set(
  [
    "await break case catch class const continue debugger default delete do else enum export",
    "extends false finally for function if import in instanceof new null return super switch",
    "this throw true try typeof var void while with yield",
    "implements interface let package private protected public static arguments eval",
  ]
    .join(" ")
    .split(" "),
);

/**
 * A webhook delivered to the app, written out as a mock or a test delivers
 * it again: `deliverWebhook` with the same body, signed with the webhook's
 * own secret — Studio never sees the secret, so the snippet names the
 * webhook by its name, or as `webhook` where no variable can be named so.
 *
 * @param r - The delivery
 * @param url - Where it was delivered
 * @returns The code
 * @example
 * ```ts
 * deliverySnippet(delivery, "http://localhost:3000/webhooks/stripe"); // "import { deliverWebhook } …"
 * ```
 */
export function deliverySnippet(r: SnippetRequest, url: string): string {
  const webhook = IDENTIFIER.test(r.source) && !RESERVED.has(r.source) ? r.source : "webhook";
  const cut = r.variablesCutFrom !== undefined;
  return [
    'import { deliverWebhook } from "@noverax/courier-mock"',
    `// ${webhook}: the webhook as defineWebhook declares it, whose secret signs the delivery`,
    "",
    ...(cut ? [wholeBodyNote(requestBodyFile(r, "request"))] : []),
    `const response = await deliverWebhook(${webhook}, {`,
    `  to: ${codeString(url)},`,
    `  body: ${cut ? "wholeBody" : bodyOf(r.variables)},`,
    "});",
  ].join("\n");
}

function bodyOf(variables: unknown): string {
  if (variables === undefined) {
    return "{} /* the event: this delivery was refused before its body was read */";
  }
  return courierArgs(variables).replace(/\n/g, "\n  ") || "{}";
}
