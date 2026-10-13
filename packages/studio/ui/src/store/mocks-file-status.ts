/**
 * How the project's `courier.mocks.*` loads, as Studio tells the UI in
 * `mocks:status`: to each UI that connects, and whenever the file or its
 * error changes. It mirrors the server's payload.
 *
 * - `file` — the file's name relative to the project root, as
 *   `watcher:change` names the files that change; `null` when the project
 *   declares no mocks.
 * - `error` — why the file did not load, on one line; `null` when it loaded
 *   or there is none. The mocks it declared last keep running meanwhile.
 */
export interface MocksFileStatus {
  file: string | null;
  error: string | null;
}
