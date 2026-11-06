import { REDACTED, urlWithoutSecrets } from "@noverax/courier/internal";

/** An import's `from` as a config may keep it, and the environment variables it reads. */
export interface ImportFrom {
  /** The property, as a line of the config: `from: "…",` or `` from: `…${process.env.PETS_SPEC_API_KEY}`, ``. */
  readonly line: string;
  /** The variables the address reads its secrets from, each once, in order: none where it carries none. */
  readonly variables: readonly string[];
}

const AUTHORITY = /^([a-z][a-z0-9+.-]{0,31}:\/\/)([^/?#]*)/i;
/* A secret cut from the address: a parameter's value, by its name, or a value with none. */
const CUT = new RegExp(`([?&#])([^=&#]{1,128})=${escaped(REDACTED)}|${escaped(REDACTED)}`, "g");

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* An address without the user and the password before its host, the rest as it is written. */
function withoutUserinfo(address: string): string {
  const parts = AUTHORITY.exec(address);
  if (parts === null) return address;
  const [whole, scheme = "", authority = ""] = parts;
  return `${scheme}${authority.slice(authority.lastIndexOf("@") + 1)}${address.slice(whole.length)}`;
}

/* Text as a template literal writes it: its backticks, backslashes and `${` escaped. */
function inTemplate(text: string): string {
  return text.replace(/[`\\]|\$\{/g, (found) => `\\${found}`);
}

/* A name an environment variable may take, in capitals: `api-key` → `API_KEY`. */
function variablePart(text: string): string {
  return text
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/**
 * What the environment variables of an import's secrets are named after:
 * the import's name, in capitals, then `SPEC` — `PETS_SPEC` — or `SPEC`
 * alone where its name gives no letter to start with.
 *
 * @param name - The import's name, where it is known
 * @returns The names' first part
 * @example
 * ```ts
 * secretsPrefix("owner-list"); // "OWNER_LIST_SPEC"
 * ```
 */
export function secretsPrefix(name: string | undefined): string {
  const part = variablePart(name ?? "");
  return /^[A-Z]/.test(part) ? `${part}_SPEC` : "SPEC";
}

/**
 * An import's `from` as the config may keep it, so that it holds no
 * secret: the address as written, without the user and the password
 * before its host, or — where it carries a secret, as Studio reads one
 * by its name or its look — a template that reads each from an
 * environment variable, named after the import and the parameter.
 *
 * @param address - The import's address
 * @param name - The import's name, where it is known
 * @returns The line, and the variables it reads
 * @example
 * ```ts
 * importFrom("https://specs.example/pets.json?api_key=…", "pets").line;
 * // "from: `https://specs.example/pets.json?api_key=${process.env.PETS_SPEC_API_KEY}`,"
 * ```
 */
export function importFrom(address: string, name: string | undefined): ImportFrom {
  const bare = withoutUserinfo(address);
  const shown = urlWithoutSecrets(bare);
  if (shown === bare) return { line: `from: ${JSON.stringify(bare)},`, variables: [] };
  const prefix = secretsPrefix(name);
  const parts = shown.split(CUT);
  const variables: string[] = [];
  let text = "";
  let unnamed = 0;
  for (let at = 0; at < parts.length; at += 3) {
    text += inTemplate(parts[at] ?? "");
    if (at + 1 >= parts.length) break;
    const [lead, param] = [parts[at + 1], parts[at + 2]];
    const named = param === undefined ? "" : variablePart(param);
    if (named === "") unnamed += 1;
    const variable =
      named !== "" ? `${prefix}_${named}` : `${prefix}_SECRET${unnamed === 1 ? "" : `_${unnamed}`}`;
    if (!variables.includes(variable)) variables.push(variable);
    const key = param === undefined ? "" : `${inTemplate(param)}=`;
    text += `${lead ?? ""}${key}\${process.env.${variable}}`;
  }
  return { line: `from: \`${text}\`,`, variables };
}
