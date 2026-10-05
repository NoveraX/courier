import { keyRuleProblem } from "./key-rule-problem";

const MAX_KEY_LENGTH = 64;
const FALLBACK = "mock";

/* my-api → myApi, 2fa → _2fa: ASCII identifier characters only, a word
   after a dropped character capitalised, and never a leading digit. */
function identifierFrom(source: string): string {
  const words = source.split(/[^A-Za-z0-9_$]+/).filter((word) => word.length > 0);
  const joined = words
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  if (joined.length === 0) return FALLBACK;
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

function withSuffix(base: string, suffix: string): string {
  return base.slice(0, MAX_KEY_LENGTH - suffix.length) + suffix;
}

/**
 * The key the wizard proposes for a new mock of a source: the source's name
 * made an identifier, else that name followed by `Mock`, `Mock2`, `Mock3`…
 * — the first a mock may take by Studio's rules and no mock has, compared
 * ignoring letter case as Studio compares keys.
 *
 * @param source - The source's key under `sources`
 * @param taken - The keys already used: declared mocks and the other new ones
 * @returns A key that passes `keyRuleProblem` and is not in `taken`
 *
 * @example
 * ```ts
 * suggestMockKey("api", []); // → "api"
 * suggestMockKey("api", ["API"]); // → "apiMock"
 * suggestMockKey("my-api", ["myApi", "myApiMock"]); // → "myApiMock2"
 * suggestMockKey("constructor", []); // → "constructorMock"
 * ```
 */
export function suggestMockKey(source: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const key of taken) used.add(key.toLowerCase());
  const base = identifierFrom(source);
  for (let attempt = 0; ; attempt++) {
    const candidate =
      attempt === 0
        ? base.slice(0, MAX_KEY_LENGTH)
        : withSuffix(base, attempt === 1 ? "Mock" : `Mock${attempt}`);
    if (keyRuleProblem(candidate) === null && !used.has(candidate.toLowerCase())) return candidate;
  }
}
