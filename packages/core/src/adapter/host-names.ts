/**
 * The host names a handler serves, as `allowedHosts` writes them: each entry
 * checked once, when the setting is read, and kept in the shape a request's
 * name is matched against, so a request costs a lookup rather than a pass
 * over the list.
 *
 * An entry is a host as a request addresses it — `app.example.com`, or the
 * `host` of a URL, whose port is read past: a name is served on every port —
 * or `*.example.com` for the sub-domains of a name, not the name itself. An
 * entry with a scheme, a path or a user is a URL where a host was meant, and
 * can never equal the name a request carries, so the page it was written
 * for would be refused with nothing to say why: it is refused instead, when
 * the setting is read.
 */

import { parseUrl } from "../utils/parse-url";

/** The longest name DNS carries, written out. */
const MAX_NAME_LENGTH = 253;

/** The names a handler serves, ready to match a request's name against. */
export interface HostNames {
  /** Names served as they are, as the URL parser writes them: lowercase, in punycode. */
  readonly names: ReadonlySet<string>;
  /** `.example.com` for `*.example.com`: a name that ends in one is served. */
  readonly suffixes: readonly string[];
}

/** The first entry of a list that names no host, and what is wrong with it. */
export interface HostEntryProblem {
  readonly entry: string;
  /** Worded to follow the entry: `has a scheme; …`. */
  readonly problem: string;
}

/**
 * Check a list of host entries and put it in the shape a request's name is
 * matched against.
 *
 * @param entries - The entries, as the setting gives them; spaces around one are read past
 * @returns The names, or the first entry that names no host and why
 * @example
 * ```ts
 * hostNamesOf(["App.example.com:8443", "*.preview.example.com"]);
 * // → { names: Set { "app.example.com" }, suffixes: [".preview.example.com"] }
 * hostNamesOf(["https://app.example.com"]);
 * // → { entry: "https://app.example.com", problem: 'has a scheme; write the host name alone: "app.example.com"' }
 * ```
 */
export function hostNamesOf(entries: readonly string[]): HostNames | HostEntryProblem {
  const names = new Set<string>();
  const suffixes = new Set<string>();
  for (const written of entries) {
    const entry = written.trim();
    const wildcard = entry.startsWith("*");
    const read = wildcard ? subdomainsOf(entry) : nameOf(entry);
    if ("problem" in read) return { entry: written, problem: read.problem };
    if (wildcard) suffixes.add(`.${read.name}`);
    else names.add(read.name);
  }
  return { names, suffixes: [...suffixes] };
}

/**
 * Whether a name is one the handler serves: listed itself, or a sub-domain
 * of a name listed with `*.`.
 *
 * @param name - The request's host name, as the URL parser writes it
 * @param hosts - The names the handler serves
 * @returns Whether the name is served
 * @example
 * ```ts
 * isHostNamed("eu.app.example.com", hosts); // true where hosts lists *.example.com
 * ```
 */
export function isHostNamed(name: string, hosts: HostNames): boolean {
  return hosts.names.has(name) || hosts.suffixes.some((suffix) => name.endsWith(suffix));
}

/* The name whose sub-domains a `*.` entry serves, or why it serves none. */
function subdomainsOf(entry: string): { name: string } | { problem: string } {
  const name = entry.slice(2);
  if (!entry.startsWith("*.") || name === "" || name.includes("*")) {
    return { problem: 'is not a host name; "*.example.com" serves the sub-domains of one' };
  }
  return nameOf(name);
}

/* The name an entry stands for, as a request's would be written, or why it stands for none. */
function nameOf(entry: string): { name: string } | { problem: string } {
  if (entry === "") return { problem: "is empty" };
  if (entry.includes("*")) return { problem: "is not a host name" };
  const shape = shapeProblem(entry);
  if (shape !== undefined) return { problem: shape };
  const url = parseUrl(`http://${entry}`);
  if (url === undefined || url.hostname === "" || url.pathname !== "/") {
    return { problem: "is not a host name" };
  }
  if (url.hostname.length > MAX_NAME_LENGTH) {
    return { problem: `is longer than a host name can be (${MAX_NAME_LENGTH} characters)` };
  }
  return { name: url.hostname };
}

/* What makes an entry a URL rather than a host, naming the host it holds where it holds one. */
function shapeProblem(entry: string): string | undefined {
  if (/\s/.test(entry)) return "has a space in it";
  const part = /^[a-z][a-z\d+.-]*:\/\//i.test(entry)
    ? "a scheme"
    : entry.includes("@")
      ? "a user"
      : /[/\\]/.test(entry)
        ? "a path"
        : entry.includes("?")
          ? "a query"
          : entry.includes("#")
            ? "a fragment"
            : undefined;
  if (part === undefined) return undefined;
  const held = parseUrl(part === "a scheme" ? entry : `http://${entry}`)?.hostname;
  return held ? `has ${part}; write the host name alone: "${held}"` : `has ${part}`;
}
