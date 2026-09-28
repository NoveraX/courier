import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { TransformOptions } from "jiti";

let jitiVersion: string | undefined;

function hasVersion(manifest: unknown): manifest is { version: string } {
  return (
    typeof manifest === "object" &&
    manifest !== null &&
    "version" in manifest &&
    typeof manifest.version === "string"
  );
}

/* A new jiti can compile the same bytes differently, so its version is part
   of every digest. Read through the resolver so a bundler that reaches this
   module does not pull jiti into its graph. */
function readJitiVersion(): string {
  if (jitiVersion !== undefined) return jitiVersion;
  const manifest: unknown = createRequire(import.meta.url)("jiti/package.json");
  if (!hasVersion(manifest)) throw new Error("jiti/package.json names no version");
  jitiVersion = manifest.version;
  return jitiVersion;
}

function isPlainData(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (Array.isArray(value)) return prototype === Array.prototype;
  return prototype === Object.prototype || prototype === null;
}

/* JSON cannot serve as the description: it drops `undefined`, writes NaN as
   `null` and -0 as `0`, calls `toJSON`, writes a RegExp or Map as `{}`, and
   throws on a cycle, so two options babel reads differently could share a
   digest or a load could fail where jiti's own transform succeeds. Here two
   values are written alike only when they are alike, and a value that cannot
   be written that way — a function, a class instance, a symbol, a bigint, a
   cycle — makes the description `null`. */
function describe(value: unknown, open: Set<object>): string | null {
  if (value === undefined) return "u";
  if (value === null) return "n";
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "number") return Object.is(value, -0) ? "#-0" : `#${value}`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object" || open.has(value) || !isPlainData(value)) return null;
  open.add(value);
  const entries: string[] = [];
  const fields: Array<[string, unknown]> = Object.entries(value);
  for (const [key, item] of fields) {
    const described = describe(item, open);
    if (described === null) return null;
    entries.push(`${JSON.stringify(key)}:${described}`);
  }
  open.delete(value);
  const [start, end] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return `${start}${entries.join(",")}${end}`;
}

/**
 * The digest of everything that shapes jiti's transform of a module: jiti's
 * version, every option but the source, and the source.
 *
 * Two inputs share a digest only when every option is alike and the source is
 * the same string, code unit for code unit, so a source that is not
 * well-formed UTF-16 is not confused with the text it would decode to. An
 * option whose value cannot be told apart from another — a babel plugin given
 * as a function, a RegExp, a cycle — yields no digest.
 *
 * @param options - What jiti hands its transform
 * @returns A hex sha256, or `null` when an option holds such a value
 * @example
 * ```ts
 * const digest = transformDigest({ filename: "/app/courier.config.ts", source, ts: true });
 * ```
 */
export function transformDigest({ source, ...rest }: TransformOptions): string | null {
  const described = describe({ ...rest, async: rest.async === true }, new Set());
  if (described === null) return null;
  return createHash("sha256")
    .update(`${readJitiVersion()}\0${described}\0`)
    .update(source, "utf16le")
    .digest("hex");
}
