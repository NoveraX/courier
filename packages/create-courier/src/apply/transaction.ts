import type { Plan } from "../plan/build-plan";
import type { PackageManager } from "../project/package-manager";
import type { SetupIO } from "../setup-io";
import { FileJournal } from "./file-journal";
import { install } from "./install";
import { interruptible } from "./interruptible";
import { type ManifestSnapshot, snapshotManifests } from "./manifest-snapshot";
import { SetupFailure } from "./setup-failure";
import { checkEditsCurrent, writePlan } from "./write-plan";

/* The exit status of a run the person stopped with Ctrl+C, as a shell gives a command it interrupts. */
const CANCELLED_STATUS = 130;

/** What one transaction changes in a project, and in what order. */
export interface Changes {
  readonly root: string;
  readonly manager: PackageManager;
  /** The files to add and the changes to make. */
  readonly plan: Plan;
  /**
   * The install, where the run installs: before the writes — a setup's,
   * whose package manager adds the packages to package.json itself — or
   * after them — an upgrade's, whose writes put the packages' ranges in
   * package.json first. None where the person installs.
   */
  readonly install?:
    | { readonly when: "before" | "after"; readonly commands: readonly string[][] }
    | undefined;
  /** What holds or fails with the writes, once they and the install are done: the programs that write types, an import. */
  readonly afterWrites?: ((signal: AbortSignal) => Promise<void>) | undefined;
}

/** The files a transaction added and changed, once it holds. */
export interface Done {
  readonly written: readonly string[];
  readonly changed: readonly string[];
}

/* Undo what the run did — its files, then package.json and the lockfile as the install left them — and say how it ended. */
function undoAfter(
  error: unknown,
  journal: FileJournal,
  snapshot: ManifestSnapshot | undefined,
  changes: Changes,
  io: SetupIO,
): number {
  const files = journal.undo();
  const manifests = snapshot?.restore() ?? { removed: [], putBack: [], kept: [] };
  const restored = new Set([...manifests.putBack, ...manifests.removed]);
  /* package.json an install rewrote is no change of the person's: the snapshot put it back. */
  const journalKept = files.kept.filter((file) => !restored.has(file.path));
  /* A file both kept is named once, as the journal names it. */
  const named = new Set(journalKept.map((file) => file.path));
  const failure = error instanceof SetupFailure ? error : undefined;
  const code = failure?.code ?? "UNEXPECTED_ERROR";
  io.report.end({
    kind: "failed",
    code,
    said: error instanceof Error ? error.message : String(error),
    undone: {
      removed: [...files.removed, ...manifests.removed],
      putBack: [...files.putBack, ...manifests.putBack],
      kept: [...journalKept, ...manifests.kept.filter((file) => !named.has(file.path))],
    },
    reinstall: snapshot === undefined ? undefined : changes.manager.install().join(" "),
    error: failure === undefined && error instanceof Error ? error : undefined,
  });
  return code === "CANCELLED" ? CANCELLED_STATUS : 1;
}

/**
 * Change a project as one transaction: install and write, in the order
 * the changes ask for, then what holds or fails with them. Every file is
 * written whole and noted; when any step fails, or the person stops it
 * with Ctrl+C, what it did is undone — the files added removed, those
 * changed put back, and package.json and the lockfile as they were
 * before the install — and the report says what stopped it, what was
 * undone and what was not.
 *
 * @param changes - What to change, and in what order
 * @param io - Where to tell what it does
 * @returns The files added and changed once it holds, or the exit status it failed with: 1, or 130 when stopped
 * @example
 * ```ts
 * const done = await transact({ root, manager, plan, install: { when: "before", commands } }, io);
 * if (typeof done === "number") return done;
 * ```
 */
export function transact(changes: Changes, io: SetupIO): Promise<Done | number> {
  const { root, plan, install: installing } = changes;
  const journal = new FileJournal(root);
  return interruptible(async (signal) => {
    /* package.json and the lockfile as they were before the first change, the install's or a write's: what undoing puts back. */
    let snapshot: ManifestSnapshot | undefined;
    const installNow = async (commands: readonly string[][]) => {
      await install(root, commands, signal, io.toolOutput);
      snapshot?.installed();
      io.report.installed(commands);
    };
    try {
      checkEditsCurrent(root, plan.edits);
      if (installing !== undefined) snapshot = snapshotManifests(root);
      if (installing?.when === "before") await installNow(installing.commands);
      writePlan(journal, root, plan);
      io.report.wrote({ written: journal.written, changed: journal.changed });
      if (installing?.when === "after") await installNow(installing.commands);
      await changes.afterWrites?.(signal);
      if (signal.aborted) throw new SetupFailure("CANCELLED", "The run was cancelled");
      return { written: journal.written, changed: journal.changed };
    } catch (error) {
      return undoAfter(error, journal, snapshot, changes, io);
    }
  });
}
