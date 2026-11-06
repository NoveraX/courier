import { importFrom, secretsPrefix } from "@noverax/create-courier/engine";

import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { boundImport } from "../codemod/imported-calls";
import { keyOf, stringOf } from "../codemod/literals";
import type { Finding, Migration } from "../migration";

const CONFIG = new Set(["@noverax/courier/config"]);
const CREDENTIALS =
  "Studio refuses a specification's address with a user or a password in it, with 400 SPEC_CREDENTIALS_IN_URL: take them out of from, and give them as the import's auth, each read from an environment variable, which courier-studio import names with --basic-env USER_VARIABLE:PASSWORD_VARIABLE";
const SECRET =
  "The import's address carries a secret, which courier.config.ts keeps in your repository, and Studio declares such an import no more: courier-studio import --yes and Add to courier.config.ts leave its entry to you. Read the secret from an environment variable, or give it as the import's auth where the host takes it in a header";

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
      const from = importFrom(address, entry.name);
      if (url.username !== "" || url.password !== "") {
        const prefix = secretsPrefix(entry.name);
        const auth = `auth: { type: "basic", username: { env: "${prefix}_USER" }, password: { env: "${prefix}_PASSWORD" } },`;
        findings.push({
          at: node.start,
          what: CREDENTIALS,
          instead: entry.auth ? [from.line] : [from.line, auth],
        });
      }
      if (from.variables.length > 0)
        findings.push({ at: node.start, what: SECRET, instead: [from.line] });
    });
    return { edits: [], findings, packages: [] };
  },
};
