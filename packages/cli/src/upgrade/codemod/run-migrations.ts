import type { ManualStep, PlannedEdit } from "@noverax/create-courier/engine";
import { parseSync } from "oxc-parser";

import type { Finding, Migration, PackageNeed, TextEdit } from "../migration";
import { type AstNode, programOf } from "./ast";
import { mentions } from "./mentions";
import { type CodePiece, codePieces, type ProjectCode, writtenByStudio } from "./source-files";
import { applyEdits, lineAt } from "./text-edits";

/* Studio keeps the person's edits to an endpoint by its code's hash, so a change the upgrade made to its file would read as theirs. */
const LEFT_TO_STUDIO =
  "Studio wrote it, so the upgrade left it as it is: Regenerate files, in the import's Manage, writes it as this release's Studio does and keeps your edits to its endpoints";

/** What migrations do to a project's code: each file's change, what is left to the person, and the packages the changes need. */
export interface MigratedCode {
  readonly edits: readonly PlannedEdit[];
  readonly manual: readonly ManualStep[];
  /** The packages each changed file needs. */
  readonly needs: ReadonlyArray<{ readonly path: string; readonly need: PackageNeed }>;
}

/* A point of a text after edits made before it: where it is now. */
function shifted(at: number, edits: readonly TextEdit[]): number {
  let delta = 0;
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    if (edit.end <= at) delta += edit.text.length - (edit.end - edit.start);
    else if (edit.start < at) return edit.start + delta;
  }
  return at + delta;
}

interface PieceResult {
  readonly text: string;
  readonly findings: Finding[];
  readonly needs: PackageNeed[];
  readonly titles: string[];
}

/* A piece's parse: its first problem, and its tree, which oxc builds only when a migration asks for it. */
interface PieceParse {
  readonly problem: { readonly message: string; readonly at: number } | null;
  readonly program: () => AstNode;
}

function parsePiece(piece: CodePiece, text: string): PieceParse {
  const parsed = parseSync(`piece${piece.parseAs}`, text);
  const [first] = parsed.errors;
  let program: AstNode | undefined;
  return {
    problem:
      first === undefined ? null : { message: first.message, at: first.labels[0]?.start ?? 0 },
    program: () => {
      program ??= programOf(parsed.program);
      return program;
    },
  };
}

/*
 * Run each migration on the text the one before left. A migration whose
 * words the text does not write is passed over; the piece is parsed for
 * the first that has any, and again only after a change, which must
 * parse: that tree is the next migration's. A change that would not
 * parse is dropped, and said.
 */
function migratePiece(piece: CodePiece, migrations: readonly Migration[]): PieceResult {
  const result: PieceResult = { text: piece.text, findings: [], needs: [], titles: [] };
  let text = piece.text;
  let parsed: PieceParse | undefined;
  for (const migration of migrations) {
    if (!mentions(text, migration.mentions)) continue;
    parsed ??= parsePiece(piece, text);
    if (parsed.problem !== null) {
      const what = `it does not parse, so the upgrade left it as written: ${parsed.problem.message}`;
      result.findings.push({ at: parsed.problem.at, what, instead: [] });
      break;
    }
    const done = migration.migrate({ path: piece.path, text, program: parsed.program() });
    const after = done.edits.length === 0 ? text : applyEdits(text, done.edits);
    if (after !== text) {
      const reparsed = parsePiece(piece, after);
      if (reparsed.problem !== null) {
        result.findings.push({
          at: 0,
          what: `the change that ${migration.title} would not parse, so it was left to you`,
          instead: [],
        });
        continue;
      }
      parsed = reparsed;
    }
    for (const finding of result.findings.splice(0))
      result.findings.push({ ...finding, at: shifted(finding.at, done.edits) });
    result.findings.push(
      ...done.findings.map((finding) => ({ ...finding, at: shifted(finding.at, done.edits) })),
    );
    result.needs.push(...done.packages);
    if (after !== text) result.titles.push(migration.title);
    text = after;
  }
  return { ...result, text };
}

/**
 * Carry the project's code over: each file that names Courier's packages,
 * each of its pieces — a module, or a component's script block — through
 * each migration in order whose words it writes. A file the migrations
 * change becomes a change of the plan; what they find and leave to the
 * person becomes a step, at its line; a file left unread, or a walk
 * stopped at its limit, is said as a step too. A file Studio wrote is
 * left to Studio, and said where a migration has something for it.
 *
 * @param code - The project's code, as the walk read it
 * @param migrations - The migrations of the releases crossed, in order
 * @returns The changes, the steps left to the person, and the packages the changes need
 * @example
 * ```ts
 * migrateCode(projectCode(root), releases.flatMap((release) => release.migrations));
 * ```
 */
export function migrateCode(code: ProjectCode, migrations: readonly Migration[]): MigratedCode {
  const edits: PlannedEdit[] = [];
  const manual: ManualStep[] = code.unread.map(({ path, why }) => ({
    file: path,
    what: `Not read: ${why}`,
    lines: [],
  }));
  const needs: Array<{ path: string; need: PackageNeed }> = [];
  for (const file of code.files) {
    const pieces = codePieces(file.path, file.text).map((piece) => ({
      piece,
      result: migratePiece(piece, migrations),
    }));
    const pieceEdits = pieces.map(({ piece, result }) => ({
      start: piece.offset,
      end: piece.offset + piece.text.length,
      text: result.text,
    }));
    const after = applyEdits(file.text, pieceEdits);
    if (writtenByStudio(file.text)) {
      if (after !== file.text || pieces.some(({ result }) => result.findings.length > 0))
        manual.push({ file: file.path, what: LEFT_TO_STUDIO, lines: [] });
      continue;
    }
    for (const { piece, result } of pieces) {
      for (const finding of result.findings) {
        const line = lineAt(after, shifted(piece.offset, pieceEdits) + finding.at);
        manual.push({
          file: file.path,
          what: `line ${line}: ${finding.what}`,
          lines: finding.instead,
        });
      }
      needs.push(...result.needs.map((need) => ({ path: file.path, need })));
    }
    if (after === file.text) continue;
    const titles = [...new Set(pieces.flatMap(({ result }) => result.titles))];
    const before = file.text;
    edits.push({
      path: file.path,
      purpose: titles.join("; "),
      state: "edit",
      before,
      after,
      change: (text) => (text === before ? after : undefined),
    });
  }
  if (code.stopped)
    manual.push({
      file: ".",
      what: "The upgrade read as many files of the project's code as it reads, and stopped: the rest were not migrated",
      lines: [],
    });
  return { edits, manual, needs };
}
