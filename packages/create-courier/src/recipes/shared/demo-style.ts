/**
 * The demo page's styles, under one class so they reach nothing of the
 * app's. They set every property a reset such as Tailwind's clears — list
 * markers, heading sizes, borders on inputs — and those a template's own
 * styles set on every heading, as SolidStart's do, and take their colours
 * from the page's own text, so they read on a light page and on a dark one.
 */
export const DEMO_CSS = `.courier-demo { box-sizing: border-box; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; font: 16px/1.5 system-ui, sans-serif; }
.courier-demo h1 { font-size: 1.75rem; font-weight: 650; line-height: 1.2; margin: 0 0 0.5rem; max-width: none; color: inherit; text-align: left; text-transform: none; letter-spacing: normal; }
.courier-demo p { margin: 0 0 1.5rem; max-width: none; opacity: 0.75; text-align: left; }
.courier-demo ul { list-style: none; margin: 0 0 1.5rem; padding: 0; border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
.courier-demo li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
.courier-demo small { font-size: 0.875rem; opacity: 0.6; }
.courier-demo form { display: flex; gap: 0.5rem; }
.courier-demo input { flex: 1; min-width: 0; font: inherit; color: inherit; background: transparent; padding: 0.5rem 0.75rem; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 0.5rem; }
.courier-demo button { font: inherit; font-weight: 600; color: #fff; background: #2563eb; padding: 0.5rem 1rem; border: 0; border-radius: 0.5rem; cursor: pointer; }
.courier-demo button:disabled { opacity: 0.6; cursor: default; }
.courier-demo code { font-family: ui-monospace, monospace; font-size: 0.875em; }
.courier-demo [role="alert"] { color: #dc2626; opacity: 1; }`;

/**
 * The sentence a demo page shows when the API does not answer: start the
 * mock, or name the backend.
 *
 * @param studio - The command that starts Studio, and with it the mock
 * @param variable - The environment variable the API's address is read from
 * @returns The sentence, after "Could not load users: …."
 * @example
 * ```ts
 * unreachableHint("npm run studio", "API_URL");
 * ```
 */
export function unreachableHint(studio: string, variable: string): string {
  return `Start the mock with <code>${studio}</code>, or set ${variable} to your backend.`;
}
