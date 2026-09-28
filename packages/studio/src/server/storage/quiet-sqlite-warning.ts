/**
 * Keep Node 22's warning that its SQLite is experimental out of Studio's
 * terminal: Studio keeps its data there by design, and the warning, printed
 * on every start, reads as a fault. Every other warning prints as before.
 * Only Studio's own process calls this; a newer Node prints no such warning.
 *
 * @example
 * ```ts
 * quietSqliteWarning(); // before Studio opens its database
 * ```
 */
export function quietSqliteWarning(): void {
  const printers = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && /SQLite/.test(warning.message)) return;
    for (const print of printers) print(warning);
  });
}
