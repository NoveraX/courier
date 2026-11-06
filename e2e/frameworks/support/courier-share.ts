import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const DIGITS = new Map(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map((char, at) => [
    char,
    at,
  ]),
);

interface RawMap {
  readonly sources?: readonly string[];
  readonly mappings?: string;
  readonly sections?: readonly { offset: { line: number; column: number }; map: RawMap }[];
}

function isRawMap(value: unknown): value is RawMap {
  return typeof value === "object" && value !== null;
}

/* The numbers one segment of a source map's mappings holds. */
function numbersOf(segment: string): number[] {
  const numbers: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = DIGITS.get(char);
    if (digit === undefined) throw new Error(`a source map's mappings hold "${char}"`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    numbers.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return numbers;
}

/* Where each segment of generated code begins, by line, and the source it came from. */
function segmentsOf(map: RawMap): { column: number; source: string | undefined }[][] {
  const lines: { column: number; source: string | undefined }[][] = [];
  let source = 0;
  for (const line of (map.mappings ?? "").split(";")) {
    const segments: { column: number; source: string | undefined }[] = [];
    let column = 0;
    for (const segment of line.split(",")) {
      if (segment === "") continue;
      const [columnDelta = 0, sourceDelta] = numbersOf(segment);
      column += columnDelta;
      if (sourceDelta !== undefined) source += sourceDelta;
      segments.push({
        column,
        source: sourceDelta === undefined ? undefined : map.sources?.[source],
      });
    }
    lines.push(segments);
  }
  return lines;
}

/* Where the code of the next module begins, as each bundler writes a chunk: Turbopack puts a
   module's ids and its factory after the module before — `},70494,e=>{` — and webpack its id as
   a key — `},473:(e,t,r)=>{`. A segment ends there: the wrapper a bundler writes around each
   module is no source's, nor is a module no map names. */
const NEXT_MODULE = /\}(?:,\d+)+,[\w$]+=>\{|\},\d+:(?:\([\w$,]*\)|[\w$]+)=>\{|\},\d+:function\(/;

/* The text of one segment, up to where the next module begins in it. */
function withinModule(text: string): string {
  const at = text.search(NEXT_MODULE);
  return at === -1 ? text : text.slice(0, at);
}

/* The generated code each source accounts for, kept where `owns` says the source is the one sought. */
function ownedText(
  lines: readonly string[],
  map: RawMap,
  owns: (source: string) => boolean,
  at = { line: 0, column: 0 },
): string {
  if (map.sections) {
    return map.sections
      .map((section) => ownedText(lines, section.map, owns, section.offset))
      .join("");
  }
  let kept = "";
  segmentsOf(map).forEach((segments, index) => {
    const text = lines[index + at.line] ?? "";
    const shift = index === 0 ? at.column : 0;
    segments.forEach((segment, next) => {
      const end = segments[next + 1]?.column;
      if (segment.source !== undefined && owns(segment.source)) {
        kept += withinModule(
          text.slice(segment.column + shift, end === undefined ? text.length : end + shift),
        );
      }
    });
  });
  return kept;
}

/**
 * What a page of a Next.js build loads at start of the code `owns` names:
 * the chunks its prerendered HTML names, each read through its source map
 * so the application's own libraries — React, React Query — are left out,
 * as `check:browser` leaves them out. A segment's code runs to where the
 * next segment begins, or the next module: the wrapper Turbopack or
 * webpack writes around each module is no source's, nor is a module no
 * map names, whichever module came before it. A chunk without a source
 * map stops the reading, as what it holds would go uncounted, unless it
 * is a copy, byte for byte, of one of `prebuilt`: files Next.js ships
 * built, which no application's module goes into. A page whose own module
 * no map names was not read either, and stops the reading rather than
 * passing as none of it.
 *
 * @param root - The application's folder, built
 * @param page - The page's path under `app/`
 * @param owns - Whether a source of a chunk is code to count
 * @param own - A part of the path of the page's own module, which some map must name
 * @param prebuilt - Files of the application's Next.js, as it resolves them, a chunk may copy with no map
 * @returns Its length, and gzipped
 * @example
 * courierShare("/tmp/next-16", "bundle/direct-caller", (source) => source.includes("@noverax/"), "bundle/direct-caller/", []);
 */
export function courierShare(
  root: string,
  page: string,
  owns: (source: string) => boolean,
  own: string,
  prebuilt: readonly string[],
): { bytes: number; gzipped: number } {
  const html = readFileSync(join(root, ".next/server/app", `${page}.html`), "utf8");
  const chunks = new Set(
    [...html.matchAll(/\/_next\/(static\/chunks\/[^"'\s\\]+\.js)/g)].map((match) => match[1] ?? ""),
  );
  const resolve = createRequire(join(root, "package.json")).resolve;
  const copies = new Set(prebuilt.map((file) => readFileSync(resolve(file), "utf8")));
  let kept = "";
  let found = false;
  for (const chunk of chunks) {
    const file = join(root, ".next", chunk);
    const code = readFileSync(file, "utf8");
    const named = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code)?.[1];
    if (named === undefined && copies.has(code)) continue;
    if (named === undefined) {
      throw new Error(
        `${chunk}, which ${page} loads at start, has no source map: what it holds would go uncounted`,
      );
    }
    const map: unknown = JSON.parse(readFileSync(join(dirname(file), named), "utf8"));
    if (!isRawMap(map)) throw new Error(`${chunk}'s source map is no source map`);
    found ||= JSON.stringify(map.sources ?? map.sections ?? []).includes(own);
    kept += ownedText(code.split("\n"), map, owns);
  }
  if (!found)
    throw new Error(
      `no source map of ${page}'s chunks names its own module: is the build without them?`,
    );
  return { bytes: kept.length, gzipped: gzipSync(kept).length };
}
