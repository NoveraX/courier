/**
 * The page's side: Courier's connection as an application opens one, with
 * the platform's WebSocket and `fetch`, driven by the checks through
 * `window.realtime`. The stand bundles it for the browser with the HTTP
 * transport in a chunk of its own, loaded once a connection needs it.
 */
import { createWSConnection, type WSConnection } from "@noverax/courier/realtime";

import { ADMITTED, type Heard, ROOM, type Said } from "./terms";

/* What a connection heard, as `Heard` reports it, kept as it comes. */
interface Tally {
  token: string;
  asked: number;
  twice: number;
  first: Said | undefined;
  readonly opens: boolean[];
  readonly ns: number[];
  readonly echoes: string[];
  readonly transports: string[];
}

const opened: { readonly connection: WSConnection; readonly tally: Tally }[] = [];

function open(url: string, userId: string): number {
  const tally: Tally = {
    token: ADMITTED,
    asked: 0,
    twice: 0,
    first: undefined,
    opens: [],
    ns: [],
    echoes: [],
    transports: [],
  };
  const connection = createWSConnection({
    url,
    /* Back at once after a close it reconnects on, so a check of one takes a moment. */
    backoff: { initialMs: 100, maxMs: 400 },
    fallback: { after: 1000 },
    credentials: () => {
      tally.asked += 1;
      return { frame: { auth: { userId, token: tally.token } } };
    },
  });
  connection.onStateChange((state) => {
    if (state.phase === "open" && tally.transports.at(-1) !== state.transport) {
      tally.transports.push(state.transport);
    }
  });
  connection.subscribe(ROOM, {
    open: (info) => void tally.opens.push(info.resumed),
    data: (payload) => take(tally, payload as Said),
  });
  opened.push({ connection, tally });
  return opened.length - 1;
}

function take(tally: Tally, said: Said): void {
  tally.first ??= said;
  if ("echo" in said) tally.echoes.push(said.echo);
  if (!("n" in said)) return;
  const last = tally.ns.at(-1);
  if (last !== undefined && said.n <= last) tally.twice += 1;
  else tally.ns.push(said.n);
}

function heard(id: number): Heard {
  const { connection, tally } = entry(id);
  const { state } = connection;
  return {
    ...tally,
    phase: state.phase,
    transport: state.phase === "open" ? state.transport : undefined,
    code: state.phase === "failed" ? state.error.code : undefined,
  };
}

function entry(id: number) {
  const found = opened[id];
  if (found === undefined) throw new RangeError(`The page opened no connection ${id}`);
  return found;
}

window.realtime = {
  open,
  heard,
  send: (id, text) => entry(id).connection.send(ROOM, text),
  setToken: (id, token) => {
    entry(id).tally.token = token;
  },
  close: (id) => entry(id).connection.close(),
};
