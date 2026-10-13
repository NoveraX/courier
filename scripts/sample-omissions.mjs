/// <reference types="node" />
/**
 * Which compiler problems in a documentation sample are the sample leaving
 * something out — the reader's own modules, a helper, a platform's types —
 * rather than getting the packages wrong. `scripts/check-doc-samples.mjs`
 * reports only the second kind.
 */

/*
 * What a sample leaves out: undeclared names (2304, 2552, 18004), modules of
 * the reader's app (2307), test globals (2593, 2582), and the implicit any
 * of a callback handed to something the sample never declared (7005, 7006,
 * 7031).
 */
const OMITTED = new Set([2304, 2307, 2503, 2552, 2580, 2582, 2593, 2749, 7005, 7006, 7031, 18004]);

/* A name used and never declared: a variable, a misspelt one, a shorthand property's value. */
const UNDECLARED = new Set([2304, 2552, 18004]);

/* Samples written for a platform whose types this check does not load. */
const PLATFORM = [
  {
    page: "deployment/cloudflare.mdx",
    text: /'ctx'|'webSocket'/,
    reason: "Cloudflare Workers' types",
  },
  {
    page: "deployment/replication.mdx",
    text: /'websocket'/,
    reason: "@fastify/websocket's route option",
  },
];

/**
 * Whether a problem is a sample leaving something out rather than getting
 * the packages wrong.
 *
 * @param {number} code - The compiler's diagnostic code
 * @param {string} text - Its message
 * @param {{ page: string, code: string, listing?: boolean, standIn?: boolean }} sample - The sample, `standIn` when it builds on the reader's code typed as anything
 * @returns {boolean} Whether the problem is not reported
 * @example
 * isOmission(2304, "Cannot find name 'users'.", { page: "a.mdx", code: "users" }); // → true
 */
export function isOmission(code, text, sample) {
  if (code === 2307 && /'@noverax\//.test(text)) return false;
  /* A listing shows the packages' own types: one no entry exports is not the reader's to leave out. */
  if (sample.listing && (code === 2304 || code === 2552) && /name '[A-Z]/.test(text)) return false;
  if (OMITTED.has(code)) return true;
  /* A Vite variable the reader declares in vite-env.d.ts; Next.js's types, when a sample loads
     them, declare an ImportMetaEnv without it. */
  if (code === 2339 && /type 'ImportMeta(?:Env)?'/.test(text)) return true;
  if (PLATFORM.some((entry) => sample.page.endsWith(entry.page) && entry.text.test(text)))
    return true;
  /* An API from the reader's app, or one built on a name the sample does
     not declare, is anything here, and the callers read anything as an API
     with streams — which a proxy caller must be given a boundary for — and
     nothing to call. */
  if (!sample.standIn) return false;
  if (/'never'|boundary|ProxyCallerDef|<any\b|Omit<any|unknown\[\]/.test(text)) return true;
  if (code === 2554 && /createProxy/.test(sample.code)) return true;
  return code === 2698 || code === 2709;
}

/**
 * The samples that use a name they never declare, which is anything here.
 *
 * @param {ReadonlyArray<{ code: number, file?: { fileName: string } }>} diagnostics - The program's diagnostics
 * @returns {Set<string>} The file of each such sample
 * @example
 * samplesLeavingOut(ts.getPreEmitDiagnostics(program)); // → Set { "/out/s3.ts" }
 */
export function samplesLeavingOut(diagnostics) {
  const files = new Set();
  for (const { code, file } of diagnostics) {
    if (file && UNDECLARED.has(code)) files.add(file.fileName);
  }
  return files;
}
