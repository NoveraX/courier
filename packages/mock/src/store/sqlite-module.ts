import type * as Sqlite from "node:sqlite";
import { createLogger } from "@noverax/courier";

const log = createLogger("MockStore");

/* Node 22 marks `node:sqlite` experimental and prints so once, as the module
   loads; Node 24 and later print nothing. What the store uses of it — a
   synchronous database, prepared statements and `exec` — is the same from
   22.13 on, so the line would tell a developer nothing they could act on. */
const EXPERIMENTAL_SQLITE = /SQLite is an experimental feature/;

let loading: Promise<typeof Sqlite | null> | undefined;

/**
 * Run `load` without the warning Node 22 prints as `node:sqlite` loads; every
 * other warning is emitted as it would be, those emitted while `load` runs
 * included.
 *
 * @param load - What loads the module
 * @returns What `load` resolves to
 * @example
 * ```ts
 * const sqlite = await withoutSqliteWarning(() => import("node:sqlite"));
 * ```
 */
export async function withoutSqliteWarning<TResult>(
  load: () => Promise<TResult>,
): Promise<TResult> {
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning: string | Error, ...rest: unknown[]): void => {
    const message = typeof warning === "string" ? warning : warning.message;
    if (EXPERIMENTAL_SQLITE.test(message)) return;
    Reflect.apply(emitWarning, process, [warning, ...rest]);
  };
  try {
    return await load();
  } finally {
    process.emitWarning = emitWarning;
  }
}

/**
 * Node's built-in SQLite, loaded once, on first use.
 *
 * @returns The module; `null` where the runtime has none — Node before 22.13, Bun
 * @example
 * ```ts
 * const sqlite = await loadSqlite();
 * if (sqlite) new sqlite.DatabaseSync(":memory:").close();
 * ```
 */
export function loadSqlite(): Promise<typeof Sqlite | null> {
  loading ??= withoutSqliteWarning(async () => {
    try {
      return await import("node:sqlite");
    } catch (error) {
      log.debug("This runtime has no node:sqlite", error);
      return null;
    }
  });
  return loading;
}
