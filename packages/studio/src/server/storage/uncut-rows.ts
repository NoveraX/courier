/**
 * A log's replay as a page without the project's token is sent it: each
 * of its events the text cut for such a page, cut the first time such a
 * page is sent it and copied after, so writing an event cuts nothing and a
 * Studio no such page connects to spends nothing on it — those a Studio
 * before the database kept that text wrote among them. The events the
 * replay sends are counted once, as the read begins, and read a few
 * milliseconds at a time, a turn of the event loop between two, so Studio
 * answers everyone else as it reads a long log, however large its events.
 */

import type { DatabaseSync, StatementSync } from "node:sqlite";

import { keptWithoutSecrets } from "../event-without-secrets";

/** How long a log reads its replay in one turn of the event loop, in milliseconds: one event at the least. */
export const READ_TURN_MS = 10;

const OPEN = Buffer.from("[");
const COMMA = Buffer.from(",");
const CLOSE = Buffer.from("]");

/**
 * What reads a log's replay as a page without the token is sent it: the
 * events its window names as the read begins, in the window's order, each
 * the text kept for such a page — cut and kept the first time, copied
 * after — {@link READ_TURN_MS} at a time, each part in one transaction. An
 * event gone meanwhile, or one another Studio kept with no text, is left
 * out.
 *
 * @param db - Studio's database
 * @param table - The log's table of events
 * @param window - Lists the `seq` of each event the replay sends, in its order, given the most of the log a replay sends
 * @param replayBytes - The most of the log a replay sends
 * @returns What reads it: the events' JSON array in UTF-8
 * @example
 * ```ts
 * const shownReplay = shownReplayReader(db, "mock_events", replaySeqs, replayBytes);
 * socket.emit("mock:events:replay", await shownReplay());
 * ```
 */
export function shownReplayReader(
  db: DatabaseSync,
  table: "request_events" | "mock_events",
  window: StatementSync,
  replayBytes: number,
): () => Promise<Uint8Array> {
  const read = db.prepare(`SELECT body, shown FROM ${table} WHERE seq = ?`);
  const keep = db.prepare(`UPDATE ${table} SET shown = ? WHERE seq = ?`);
  /* One event as such a page is sent it: `''` kept where cutting changed nothing. */
  const shownOf = (seq: number): string | undefined => {
    const row = read.get(seq);
    const body = row?.body;
    if (typeof body !== "string") return undefined;
    if (typeof row?.shown === "string") return row.shown === "" ? body : row.shown;
    const cut = keptWithoutSecrets(body);
    keep.run(cut, seq);
    return cut === "" ? body : cut;
  };
  /* Reads the events from the one named on for a turn's while: where it stopped. */
  const readFrom = (seqs: readonly number[], from: number, texts: Buffer[]): number => {
    const until = performance.now() + READ_TURN_MS;
    let at = from;
    db.exec("BEGIN");
    try {
      do {
        const seq = seqs[at++];
        const text = seq === undefined ? undefined : shownOf(seq);
        if (text !== undefined) texts.push(Buffer.from(text, "utf8"));
      } while (at < seqs.length && performance.now() < until);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return at;
  };
  return async () => {
    const seqs = window.all(replayBytes).map((row) => Number(row.seq));
    const texts: Buffer[] = [];
    for (let at = 0; at < seqs.length; ) {
      await turn();
      at = readFrom(seqs, at, texts);
    }
    await turn();
    return Buffer.concat([
      OPEN,
      ...texts.flatMap((text, at) => (at === 0 ? [text] : [COMMA, text])),
      CLOSE,
    ]);
  };
}

function turn(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}
