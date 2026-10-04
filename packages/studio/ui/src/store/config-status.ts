/**
 * How `courier.config` loads, as Studio tells the UI in `config:status`:
 * after every outcome of a load, and to each UI that connects. It mirrors
 * the server's payload; `socket/config-status-guard.ts` checks every one
 * before it reaches the store.
 *
 * - `starting` — no load has had an outcome yet.
 * - `loaded` — the latest load succeeded; `configFile` is what Studio runs.
 * - `failed` — the latest load failed; Studio keeps running what it loaded
 *   at `lastGoodAt`, or nothing when that is `null`.
 * - `missing` — there is no config, as Studio found at `missingAt`; Studio
 *   keeps running what it loaded at `lastGoodAt`, or nothing when that is
 *   `null`.
 *
 * In `failed` and `missing`, `configFile` is the file Studio runs, and
 * `null` when it runs none. After a delete it names the file that is gone;
 * after a failure it may name another file than the one that failed, which
 * the error's message names.
 *
 * `revision` grows by one with each outcome, so a higher one is a newer
 * outcome. Times are epoch milliseconds; paths are relative to the project
 * root, with `/` separators. Studio sends the status after the imports and
 * source lists it describes, so the lists in the store match it once it
 * arrives.
 */
export type ConfigStatusPayload =
  | { state: "starting"; revision: 0 }
  | { state: "loaded"; revision: number; configFile: string; loadedAt: number }
  | {
      state: "failed";
      revision: number;
      configFile: string | null;
      error: { code: string; message: string };
      failedAt: number;
      lastGoodAt: number | null;
    }
  | {
      state: "missing";
      revision: number;
      configFile: string | null;
      missingAt: number;
      lastGoodAt: number | null;
    };
