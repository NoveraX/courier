import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { occurrencesOf } from "../codemod/identifier-roles";
import { boundOnce, textOf } from "../codemod/imported-calls";
import { namedImports } from "../codemod/imports";
import { closureKinds, viaCalls } from "../codemod/via-closures";
import type { Finding, Migration } from "../migration";

const DEFINE = new Set(["@noverax/courier/define"]);
const UNSAID =
  'HttpProbe<Variables> no longer says which verb its closure calls, so the endpoint names its kind: by the call the closure returns, WireCall<"query"> for a read or WireCall<"mutation"> for a write, or by .reads() or .writes() after .via()';

/* The const a type annotates, where it is one's: const byId: HttpProbe<…> = …, its value, and whether the file exports it there. */
function annotatedConst(ancestors: readonly AstNode[]) {
  const [declarator, id, annotation] = [ancestors.at(-3), ancestors.at(-2), ancestors.at(-1)];
  const name = nameOf(id);
  if (annotation?.type !== "TSTypeAnnotation" || declarator?.type !== "VariableDeclarator")
    return undefined;
  if (name === undefined || declarator.id !== id || ancestors.at(-4)?.kind !== "const")
    return undefined;
  return {
    name,
    init: declarator.init,
    exported: ancestors.at(-5)?.type === "ExportNamedDeclaration",
  };
}

/**
 * 0.5.0: an endpoint addressed with `.via()` takes its kind from the
 * call its closure returns, which `HttpProbe<Variables>` types as either
 * kind. Each such type is found, with the type that names the call — of
 * the kind its closure's verbs give, where the closure is written there.
 * A const of the file's own needs nothing where every reference to it is
 * a `.via()` whose endpoint names its kind.
 */
export const HTTP_PROBE_TYPE: Migration = {
  id: "0.5.0/http-probe-type",
  title: "finds a closure typed HttpProbe<Variables>, whose verb its type no longer says",
  mentions: ["HttpProbe"],
  migrate(file) {
    const none = { edits: [], findings: [], packages: [] };
    const probe = namedImports(file.program, DEFINE).find(
      (each) => each.kind === "import" && each.imported === "HttpProbe",
    );
    if (probe === undefined || !boundOnce(file.program, probe)) return none;
    const typed: Array<{
      node: AstNode;
      argument: AstNode;
      held: ReturnType<typeof annotatedConst>;
    }> = [];
    walk(file.program, ({ node, ancestors }) => {
      if (node.type !== "TSTypeReference" || nameOf(node.typeName) !== probe.local) return;
      const { typeArguments } = node;
      const params =
        isNode(typeArguments) && Array.isArray(typeArguments.params)
          ? typeArguments.params.filter(isNode)
          : [];
      const [argument] = params;
      if (argument !== undefined && params.length === 1)
        typed.push({ node, argument, held: annotatedConst(ancestors) });
    });
    if (typed.length === 0) return none;
    const said = new Map<string, boolean[]>();
    for (const { closure, after } of viaCalls(file.program)) {
      const name = nameOf(closure);
      const named = after.some((method) => method.name === "reads" || method.name === "writes");
      if (name !== undefined) said.set(name, [...(said.get(name) ?? []), named]);
    }
    const kindSaid = (name: string) => {
      const occurrences = occurrencesOf(file.program, name);
      const references = occurrences.filter((each) => each.role === "reference").length;
      const uses = said.get(name) ?? [];
      return (
        occurrences.filter((each) => each.role === "binding").length === 1 &&
        uses.length > 0 &&
        uses.length === references &&
        uses.every(Boolean)
      );
    };
    const findings: Finding[] = typed.flatMap(({ node, argument, held }) => {
      if (held !== undefined && !held.exported && kindSaid(held.name)) return [];
      const kinds = held === undefined ? undefined : closureKinds(held.init);
      const named = (kind: string) =>
        `${probe.local}<${textOf(file, argument)}, WireCall<"${kind}">>`;
      const [only] = kinds?.size === 1 ? [...kinds] : [];
      return [
        {
          at: node.start,
          what: UNSAID,
          instead: only === undefined ? [named("query"), named("mutation")] : [named(only)],
        },
      ];
    });
    return { ...none, findings };
  },
};
