import { type AstNode, isNode } from "../codemod/ast";
import {
  bindsOtherwise,
  CORE_ENTRIES,
  CORE_ROOT,
  type EntrySide,
  entryTakes,
  leftToRoot,
} from "../entries/entry-names";
import type { PieceSide } from "../entries/piece-sides";
import type { FileMigration, Finding, Migration, TextEdit } from "../migration";
import {
  callFinding,
  rootOnlyFinding,
  serverCallerFinding,
  serverNamesFinding,
  type TakenName,
  throughFinding,
  untoldFinding,
  wholeFinding,
} from "./entry-findings";
import { rootLoads } from "./entry-loads";
import { type Taken, takenBy } from "./entry-taken";
import { startFinding, unfollowedImportFinding } from "./start-findings";
import { narrowed, startKeeps } from "./start-keeps";

const NOTHING: FileMigration = { edits: [], findings: [], packages: [] };
const DECLARATIONS = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
]);
/* A declaration file, whose imports are of types the build erases. */
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/* The entry a declaration goes to: the page's, where a page may load the piece and it takes every name — one the page's entry binds otherwise only where no server may load it — else the server's, where only the server may. */
function targetOf(side: PieceSide, names: readonly TakenName[] | undefined): EntrySide | undefined {
  if (names === undefined || names.length === 0) return undefined;
  const takes = (each: EntrySide) => names.every(({ name }) => entryTakes(each, name));
  if (side.maybePage) {
    const otherwise = names.some(({ name }) => bindsOtherwise("client", name));
    return takes("client") && (!side.maybeServer || !otherwise) ? "client" : undefined;
  }
  return side.maybeServer && takes("server") ? "server" : undefined;
}

/* The entry a declaration of types alone goes to, which no bundle loads: one that gives every name — the server's first where only the server runs the piece, never the page's where it binds a name otherwise. */
function typeTarget(
  side: PieceSide,
  names: readonly TakenName[] | undefined,
): EntrySide | undefined {
  if (names === undefined || names.length === 0) return undefined;
  const order: EntrySide[] =
    !side.maybePage && side.maybeServer ? ["server", "client"] : ["client", "server"];
  return order.find((each) =>
    names.every(({ name }) => entryTakes(each, name) && !bindsOtherwise(each, name)),
  );
}

/* What a page is told of a declaration that stays in the root: the server's names it takes, a caller the server loads too, or the root taken whole. */
function findingOf(side: PieceSide, taken: Taken): Finding | undefined {
  const at = taken.statement.start;
  if (taken.names === undefined)
    return { at, ...(taken.call ? callFinding(taken.call) : wholeFinding(taken.star)) };
  const server = ({ name }: TakenName) =>
    !entryTakes("client", name) && entryTakes("server", name) && !leftToRoot("client", name);
  if (taken.names.some(server)) return { at, ...serverNamesFinding(taken.names) };
  const otherwise = taken.names.filter(({ name }) => bindsOtherwise("client", name));
  if (otherwise.length > 0) return { at, ...serverCallerFinding(side, otherwise) };
  const root = taken.names.some(({ name }) => leftToRoot("client", name));
  return root ? { at, ...rootOnlyFinding(taken.names) } : undefined;
}

/* The string a declaration or a load names the root by, written to name an entry in the quotes it was written in. */
function sourceEdit(text: string, source: AstNode, side: EntrySide): TextEdit {
  const quote = text[source.start] ?? '"';
  return { start: source.start, end: source.end, text: `${quote}${CORE_ENTRIES[side]}${quote}` };
}

/**
 * 0.5.0: the core has an entry for a page, `@noverax/courier/client`, and
 * one for a server, `@noverax/courier/server`, beside the root, which
 * gives both and takes the server's part into a page's bundle. Each
 * import and re-export of the root's moves to the entry of the side that
 * loads its piece of code: the page's where a page's bundle may have it
 * and the entry gives every name it takes — `createCaller`, which the
 * page's entry binds to a page's caller, only where no server may load
 * the piece — and the server's where only the server may. In a module
 * TanStack Start builds for both, an import whose names one side's build
 * alone keeps — the other's takes the code that uses them out — is that
 * side's. One that stays is said where a page loads it for certain, or
 * may through a package's
 * name whose entry Courier could not follow, and so is a piece neither
 * side is told to load. An import of types alone, which no bundle loads,
 * moves to an entry that gives every type, with nothing said — `type` on
 * each name only where the package's tsconfig does not keep it as a load.
 * A declaration file is left as it is.
 */
export const ENTRY_IMPORTS: Migration = {
  id: "0.5.0/entry-imports",
  title: "takes a page's imports from @noverax/courier/client and a server's from /server",
  mentions: [CORE_ROOT],
  migrate(file, project) {
    if (DECLARATION_FILE.test(file.path)) return NOTHING;
    const body = Array.isArray(file.program.body) ? file.program.body.filter(isNode) : [];
    const taken = body
      .filter(
        (each) =>
          DECLARATIONS.has(each.type) && isNode(each.source) && each.source.value === CORE_ROOT,
      )
      .flatMap((statement) => takenBy(statement, file.program) ?? [])
      .concat(rootLoads(file.program));
    if (taken.length === 0) return NOTHING;
    const side = project.sideOf(file.path, file.piece);
    /* What no bundle loads: a declaration of types, and types named one by one where the package's tsconfig drops them. */
    const erased = ({ typesAlone }: Taken) =>
      typesAlone === "declaration" || (typesAlone === "names" && side.keepsTypeImports !== true);
    const edits: TextEdit[] = [];
    const findings: Finding[] = [];
    for (const each of taken.filter(erased)) {
      const target = each.star ? undefined : typeTarget(side, each.names);
      const edit = target === undefined ? undefined : sourceEdit(file.text, each.source, target);
      if (edit !== undefined) edits.push(edit);
    }
    const loads = taken.filter((each) => !erased(each));
    if (!side.maybePage && !side.maybeServer) {
      const first = loads[0];
      if (first !== undefined)
        findings.push({ at: first.statement.start, ...untoldFinding(side, first.names) });
      return { edits, findings, packages: [] };
    }
    /* Where Start builds the module for both sides: what each one's build keeps of a declaration's names. */
    const keeps = startKeeps(side, file.program);
    for (const each of loads) {
      const kept = keeps?.kept(each);
      const own = kept === undefined ? side : narrowed(side, kept);
      const target = each.star ? undefined : targetOf(own, each.names);
      const edit = target === undefined ? undefined : sourceEdit(file.text, each.source, target);
      if (edit !== undefined) edits.push(edit);
      else if (own.page) {
        const told =
          kept !== undefined && own === side
            ? startFinding(kept, keeps?.unfollowed() ?? [])
            : undefined;
        const finding =
          told === undefined ? findingOf(own, each) : { at: each.statement.start, ...told };
        if (finding !== undefined) findings.push(finding);
      } else if (own.pageThrough !== undefined)
        findings.push({
          at: each.statement.start,
          ...throughFinding(own.pageThrough, each.names),
        });
      else if (own.pageUnfollowed !== undefined && each.names !== undefined)
        findings.push({
          at: each.statement.start,
          ...unfollowedImportFinding(own.pageUnfollowed, each.names),
        });
    }
    return { edits, findings, packages: [] };
  },
};
