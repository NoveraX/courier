/**
 * Run as a child of a probe, with an IPC channel: open `count` connections
 * to `url` with Courier's own client, each as user `u<first + i>`, and
 * subscribe each to the probe's room. On `websocket` each opens a
 * WebSocket; on `stream` or `poll`, each starts on that HTTP transport, as
 * a tab that fell back before does, its session keeping the transport it
 * was on; on `ladder`, each climbs down from WebSocket as far as it must.
 *
 * It tells the probe how many are subscribed, and how many WebSocket
 * carries, whenever that changes, and answers its questions: once every connection has had event `n`, how
 * long each timed event took to reach each connection, and which events,
 * counted from the first each had, came twice or never. An event is
 * `{ n, t }`, `t` the broadcast's start on the host's monotonic clock, in
 * µs, which every process on one machine reads alike.
 *
 * They open and close in waves of `wave`, each once the last is done: a
 * server's listen queue holds only so many connections coming at once —
 * 128 on macOS, which resets the rest — so the probe gives each process
 * its share of what the queue holds. Given `socket`, a Unix socket's path,
 * they reach `url`'s server through it, as clients on hosts of their own
 * would: on one host, a connection through an entry would hold two of its
 * ephemeral ports, and a storm of thousands runs out of them.
 *
 *   node transports-clients.mjs <url> <websocket|stream|poll|ladder> <count> <first> <wave> [socket]
 */
import { argv, exit, hrtime } from "node:process";

import { createWSConnection, qualifyTopic } from "@noverax/courier/realtime";
/* npm's undici, not Node 24's own: Node 24.22's (7.30) throws from setting the type of service
   of a socket its peer has reset, outside any request, and the process ends with it, where
   undici 8 takes that for the best effort it is. */
import { Agent, fetch, WebSocket } from "undici";

const [
  url = "",
  transport = "websocket",
  countArg = "1",
  firstArg = "0",
  waveArg = "25",
  socketPath = "",
] = argv.slice(2);
const COUNT = Number(countArg);
const FIRST = Number(firstArg);
const WAVE = Number(waveArg);
/* How long the probe's question waits for the event every connection is to have had. */
const AWAIT_MS = 60_000;
const ROOM = qualifyTopic("api.room", { room: "all" });
/* Every request and socket of the process by way of the socket path, when there is one. */
const through =
  socketPath === "" ? undefined : { dispatcher: new Agent({ connect: { socketPath } }) };

const nowUs = () => Number(hrtime.bigint() / 1000n);
const tell = (message) => process.send?.(message);

if (transport === "stream" || transport === "poll") {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => (key.startsWith("courier:ws:") ? transport : null),
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
}

/** What one connection had: the last event, those it missed and had twice, whether it is subscribed and on WebSocket, and how often it opened again without resuming. */
function tallyOf() {
  return {
    last: undefined,
    missed: 0,
    twice: 0,
    opened: false,
    subscribed: false,
    onWebSocket: false,
    brokenOff: 0,
    states: [],
  };
}

/* The states a connection was last in, with when, for a probe that asks why it is not subscribed. */
const STATES_KEPT = 12;

const tallies = [];
const connections = [];
let latencies = [];
const counts = { subscribed: 0, websocket: 0 };
let told = { ...counts };
let telling;

/* How many are subscribed, and on WebSocket, told once the changes of a turn are over, with when
   the last was. */
function changed(field, by) {
  counts[field] += by;
  const at = nowUs();
  clearTimeout(telling);
  telling = setTimeout(() => {
    if (counts.subscribed === told.subscribed && counts.websocket === told.websocket) return;
    told = { ...counts };
    tell({ kind: "counts", ...told, at });
  }, 5);
}

/* The first runs of events missed, with the connection's last states: what a probe that saw
   events lost tells. */
const GAPS_KEPT = 10;
const gaps = [];

function received(tally, index, { n, t }) {
  if (tally.last !== undefined && n <= tally.last) tally.twice++;
  else {
    if (tally.last !== undefined && n > tally.last + 1) {
      tally.missed += n - tally.last - 1;
      if (gaps.length < GAPS_KEPT) {
        const at = Math.round(performance.now());
        gaps.push({
          user: `u${FIRST + index}`,
          from: tally.last + 1,
          to: n - 1,
          at,
          states: [...tally.states],
        });
      }
    }
    tally.last = n;
  }
  if (typeof t === "number") latencies.push(nowUs() - t);
}

/* A state as a probe reads it: what the platform said of a failure kept as its code, which an
   error's own fields, not enumerable, would not carry over IPC. */
function described(state) {
  const event = state.cause?.error;
  if (event === undefined) return state;
  const error = event.error ?? event;
  const said = error?.cause?.code ?? error?.code ?? error?.cause?.message ?? error?.message;
  return { ...state, cause: { ...state.cause, error: said ?? String(error) } };
}

/* A connection opened, and subscribed: settled once its subscription first opens. */
function open(index) {
  const tally = tallyOf();
  tallies.push(tally);
  const connection = createWSConnection({
    url,
    credentials: () => ({ frame: { auth: { userId: `u${FIRST + index}` } } }),
    fetch,
    webSocket: WebSocket,
    fetchInit: through,
    socketInit: through,
  });
  connections.push(connection);
  connection.onStateChange((state) => {
    tally.states.push({ at: Math.round(performance.now()), ...described(state) });
    if (tally.states.length > STATES_KEPT) tally.states.shift();
    const onWebSocket = state.transport === "websocket";
    if (onWebSocket === tally.onWebSocket) return;
    tally.onWebSocket = onWebSocket;
    changed("websocket", onWebSocket ? 1 : -1);
  });
  return new Promise((opened) => {
    connection.subscribe(
      ROOM,
      {
        open({ resumed }) {
          /* Opened again without resuming: what came while it was away is not all there. */
          if (tally.opened && !resumed) tally.brokenOff++;
          tally.opened = true;
          opened();
          if (tally.subscribed) return;
          tally.subscribed = true;
          changed("subscribed", 1);
        },
        wait() {
          if (!tally.subscribed) return;
          tally.subscribed = false;
          changed("subscribed", -1);
        },
        data: (payload) => received(tally, index, payload),
      },
      { room: "all" },
    );
  });
}

/* Once every connection has had event `n`, or the wait is over: what they had. */
async function awaitEvent(n) {
  const deadline = performance.now() + AWAIT_MS;
  const short = () => tallies.filter((tally) => tally.last === undefined || tally.last < n).length;
  while (short() > 0 && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const taken = latencies;
  latencies = [];
  const sum = (field) => tallies.reduce((total, tally) => total + tally[field], 0);
  return {
    kind: "awaited",
    short: short(),
    latencies: taken,
    missed: sum("missed"),
    twice: sum("twice"),
    brokenOff: sum("brokenOff"),
    gaps,
    transports: transportsOf(),
  };
}

/* How many connections each transport carries now. */
function transportsOf() {
  const counts = {};
  for (const connection of connections) {
    const carried = connection.state.transport ?? "none";
    counts[carried] = (counts[carried] ?? 0) + 1;
  }
  return counts;
}

/* Those not subscribed now, a few of them: who, and the states each was last in. */
function stuck() {
  const unsubscribed = [];
  tallies.forEach((tally, index) => {
    if (!tally.subscribed && unsubscribed.length < 5) {
      unsubscribed.push({
        user: `u${FIRST + index}`,
        now: Math.round(performance.now()),
        states: tally.states,
      });
    }
  });
  return { kind: "stuck", unsubscribed };
}

process.on("message", async (message) => {
  if (message?.kind === "await") tell(await awaitEvent(message.n));
  if (message?.kind === "stuck") tell(stuck());
  if (message?.kind === "close") {
    /* In waves too, a request each over HTTP, all gone before the process ends. */
    for (let first = 0; first < connections.length; first += WAVE) {
      for (const connection of connections.slice(first, first + WAVE)) connection.close();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    setTimeout(() => exit(0), 200);
  }
});
process.on("disconnect", () => exit(0));

/* In waves, each once the last is subscribed. */
for (let first = 0; first < COUNT; first += WAVE) {
  const wave = [];
  for (let index = first; index < Math.min(COUNT, first + WAVE); index++) wave.push(open(index));
  await Promise.all(wave);
}
