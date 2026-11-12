import { expect } from "vitest";

export const LINE_SEPARATOR = String.fromCharCode(0x2028);
export const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** Text that a string, a template, a page's script and a line each end or change at. */
export const AWKWARD = [
  'a"b',
  "'c",
  "`d",
  "\\e",
  "$",
  "{f}",
  "</script>",
  "<!--g-->",
  LINE_SEPARATOR,
  "h",
  PARAGRAPH_SEPARATOR,
].join("");

/**
 * Check that code holds nothing that ends the page's script it is put in,
 * or a line of it, before its own text does.
 *
 * @param code - The code
 */
export function expectNothingEndsTheCode(code: string): void {
  expect(code).not.toMatch(/<\/|<!--/);
  expect(code).not.toContain(LINE_SEPARATOR);
  expect(code).not.toContain(PARAGRAPH_SEPARATOR);
}

type AsyncBody = new (...names: string[]) => (...values: unknown[]) => Promise<unknown>;

/**
 * Run code as written, as the body of an async function, with each name it
 * reads given a value.
 *
 * @param code - The code
 * @param scope - The names it reads, and their values
 * @returns Once it has run
 */
export async function runCode(code: string, scope: Record<string, unknown>): Promise<void> {
  const Body = Object.getPrototypeOf(async () => undefined).constructor as AsyncBody;
  await new Body(...Object.keys(scope), code)(...Object.values(scope));
}
