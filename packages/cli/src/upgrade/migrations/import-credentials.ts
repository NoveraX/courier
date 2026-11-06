import { REDACTED, urlWithoutSecrets } from "@noverax/courier/internal";

import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { boundImport } from "../codemod/imported-calls";
import { keyOf, stringOf } from "../codemod/literals";
import type { Finding, Migration } from "../migration";

const CONFIG = new Set(["@noverax/courier/config"]);
const CREDENTIALS =
  "Studio refuses a specification's address with a user or a password in it, with 400 SPEC_CREDENTIALS_IN_URL: take them out of from, and give them as the import's auth, each read from an environment variable, which courier-studio import names with --basic-env USER_VARIABLE:PASSWORD_VARIABLE";
const SECRET =
  "The import's address carries a secret, which courier.config.ts keeps in your repository, and Studio declares such an import no more: courier-studio import --yes and Add to courier.config.ts leave its entry to you. Read the secret from an environment variable, or give it as the import's auth where the host takes it in a header";
const AUTHORITY = /^([a-z][a-z0-9+.-]{0,31}:\/\/)([^/?#]*)/i;
/* A secret cut from the address: a parameter's value, by its name, or a value with none. */
const CUT = new RegExp(`([?&#])([^=&#]{1,128})=${escaped(REDACTED)}|${escaped(REDACTED)}`, "g");

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* An address without the user and the password before its host, the rest as the config writes it. */
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

/* `from` as the instead writes it: as given, or as a template that reads each secret from a variable named for the import. */
function fromLine(bare: string, prefix: string): string {
  const shown = urlWithoutSecrets(bare);
  if (shown === bare) return `from: ${JSON.stringify(bare)},`;
  const parts = shown.split(CUT);
  let text = "";
  let unnamed = 0;
  for (let at = 0; at < parts.length; at += 3) {
    text += inTemplate(parts[at] ?? "");
    if (at + 1 >= parts.length) break;
    const [lead, name] = [parts[at + 1], parts[at + 2]];
    const named = name === undefined ? "" : variablePart(name);
    const variable =
      named === ""
        ? `${prefix}_SECRET${unnamed++ === 0 ? "" : `_${unnamed}`}`
        : `${prefix}_${named}`;
    const param = name === undefined ? "" : `${inTemplate(name)}=`;
    text += `${lead ?? ""}${param}\${process.env.${variable}}`;
  }
  return `from: \`${text}\`,`;
}

/* The import a `from` declares, `imports: { name: { from } }` inside the config: its name, and whether its entry gives an auth. */
function importOf(ancestors: readonly AstNode[]): { name: string; auth: boolean } | undefined {
  const [imports, , entry, object] = ancestors.slice(-4);
  if (imports?.type !== "Property" || keyOf(imports.key) !== "imports") return undefined;
  if (entry?.type !== "Property" || object?.type !== "ObjectExpression") return undefined;
  const properties = Array.isArray(object.properties) ? object.properties : [];
  const auth = properties.some((each) => isNode(each) && keyOf(each.key) === "auth");
  return { name: keyOf(entry.key) ?? "", auth };
}

/**
 * 0.5.0: Studio refuses a specification's address with a user or a
 * password in it, with `SPEC_CREDENTIALS_IN_URL`, and declares no import
 * whose address carries a secret, which the config would keep in the
 * repository. Each such `from` of the config's imports is found — its
 * address shown without the secret, and the variables to read it from
 * named for the import — and left as written: only the person can set
 * the variables.
 */
export const IMPORT_CREDENTIALS: Migration = {
  id: "0.5.0/import-credentials",
  title: "finds an import's from with a credential or a secret in its address",
  mentions: ["defineConfig"],
  migrate(file) {
    const findings: Finding[] = [];
    const define = boundImport(file.program, CONFIG, "defineConfig");
    if (define === undefined) return { edits: [], findings, packages: [] };
    walk(file.program, ({ node, ancestors }) => {
      if (node.type !== "Property" || node.computed === true || keyOf(node.key) !== "from") return;
      const address = stringOf(node.value);
      const entry = importOf(ancestors);
      const configured = ancestors.some(
        (each) => each.type === "CallExpression" && nameOf(each.callee) === define.local,
      );
      if (address === undefined || entry === undefined || !configured || !URL.canParse(address))
        return;
      const url = new URL(address);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      const bare = withoutUserinfo(address);
      const prefix = /^[A-Z]/.test(variablePart(entry.name))
        ? `${variablePart(entry.name)}_SPEC`
        : "SPEC";
      const from = fromLine(bare, prefix);
      if (url.username !== "" || url.password !== "") {
        const auth = `auth: { type: "basic", username: { env: "${prefix}_USER" }, password: { env: "${prefix}_PASSWORD" } },`;
        findings.push({
          at: node.start,
          what: CREDENTIALS,
          instead: entry.auth ? [from] : [from, auth],
        });
      }
      if (urlWithoutSecrets(bare) !== bare)
        findings.push({ at: node.start, what: SECRET, instead: [from] });
    });
    return { edits: [], findings, packages: [] };
  },
};
