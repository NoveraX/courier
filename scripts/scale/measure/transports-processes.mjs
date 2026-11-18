/**
 * The processes a transports probe runs: replicas (`transports-replica.mjs`)
 * and Courier's clients (`transports-clients.mjs`), each a child with an
 * IPC channel, and what the probe asks of them. Every wait has a deadline,
 * after which the probe stops with what it waited for.
 */
import { fork } from "node:child_process";
import { join } from "node:path";

/* How long any one answer of a child is waited for. */
const ANSWER_MS = 90_000;
/* Connections the clients' processes open at once, together. Each may take two of the server's
   listen queue — a stream and the request that subscribes it — which on macOS holds 128 and
   resets the connections past it. */
const AT_ONCE = 48;
const HERE = import.meta.dirname;

/**
 * A replica in a process of its own.
 *
 * @param {{ upgrades?: boolean, redis?: string }} config - Whether it takes WebSocket upgrades, and the Redis of its cluster
 * @returns {Promise<{ url: string, port: number, ask: (kind: string, fields?: object) => Promise<any>, kill: () => void }>} The replica, listening
 * @example
 * ```js
 * const replica = await startReplica({ upgrades: false });
 * const { bytes } = await replica.ask("heap");
 * ```
 */
export async function startReplica(config) {
  const child = fork(join(HERE, "transports-replica.mjs"), [JSON.stringify(config)], {
    execArgv: ["--expose-gc"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  child.on("error", ignoreGone);
  const { port } = await next(child, (message) => message.kind === "listening", "a replica's port");
  let lastId = 0;
  return {
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    ask(kind, fields = {}) {
      const id = ++lastId;
      child.send({ kind, id, ...fields });
      return next(child, (message) => message.id === id, `a replica's answer to ${kind}`);
    },
    kill: () => child.kill("SIGKILL"),
  };
}

/**
 * Courier's clients in processes of their own, `count` connections spread
 * over `processes`, each user its own.
 *
 * @param {string} url - Where they connect
 * @param {"websocket" | "stream" | "poll" | "ladder"} transport - The transport they start on
 * @param {number} count - The connections
 * @param {number} processes - The processes they are spread over
 * @param {string} [socketPath] - A Unix socket that `url`'s server listens on, which they reach it through
 * @returns {{ when: (test: (counts: Counts) => boolean, what: string) => Promise<number>, awaitEvent: (n: number) => Promise<any>, stuck: () => Promise<any[]>, close: () => Promise<void> }} The clients
 * @example
 * ```js
 * const clients = startClients(replica.url, "stream", 2_000, 2);
 * await clients.when(({ subscribed }) => subscribed === 2_000, "every connection subscribed");
 * ```
 */
export function startClients(url, transport, count, processes, socketPath = "") {
  const share = Math.ceil(count / processes);
  const children = [];
  /** @type {Counts[]} */
  const counts = [];
  const watchers = new Set();
  for (let first = 0; first < count; first += share) {
    const index = children.length;
    const child = fork(
      join(HERE, "transports-clients.mjs"),
      [
        url,
        transport,
        String(Math.min(share, count - first)),
        String(first),
        String(Math.max(1, Math.floor(AT_ONCE / processes))),
        socketPath,
      ],
      { stdio: ["ignore", "ignore", "inherit", "ipc"] },
    );
    child.on("error", ignoreGone);
    counts.push({ subscribed: 0, websocket: 0 });
    child.on("message", (message) => {
      if (message?.kind !== "counts") return;
      counts[index] = { subscribed: message.subscribed, websocket: message.websocket };
      for (const watch of watchers) watch(message.at);
    });
    children.push(child);
  }
  const now = () => ({
    subscribed: counts.reduce((sum, each) => sum + each.subscribed, 0),
    websocket: counts.reduce((sum, each) => sum + each.websocket, 0),
  });
  return {
    /* Once the counts of those subscribed and those on WebSocket pass `test`: when they did, on
       the host's monotonic clock in µs, or 0 when they already had. */
    when(test, what) {
      const seen = () => {
        const { subscribed, websocket } = now();
        return `${subscribed} of ${count} subscribed, ${websocket} on WebSocket`;
      };
      return within(what, seen, (done) => {
        const watch = (at) => {
          if (!test(now())) return;
          watchers.delete(watch);
          done(at);
        };
        watchers.add(watch);
        watch(0);
      });
    },
    async awaitEvent(n) {
      const answers = await Promise.all(
        children.map((child) => {
          child.send({ kind: "await", n });
          return next(child, (message) => message.kind === "awaited", `the clients' event ${n}`);
        }),
      );
      return {
        short: answers.reduce((sum, each) => sum + each.short, 0),
        missed: answers.reduce((sum, each) => sum + each.missed, 0),
        twice: answers.reduce((sum, each) => sum + each.twice, 0),
        brokenOff: answers.reduce((sum, each) => sum + each.brokenOff, 0),
        gaps: answers.flatMap((each) => each.gaps),
        latencies: answers.flatMap((each) => each.latencies),
        transports: answers.map((each) => each.transports),
      };
    },
    /* A few of the connections not subscribed now, from each process: who, and their last states. */
    async stuck() {
      const answers = await Promise.all(
        children.map((child) => {
          child.send({ kind: "stuck" });
          return next(child, (message) => message.kind === "stuck", "the clients' unsubscribed");
        }),
      );
      return answers.flatMap((each) => each.unsubscribed);
    },
    async close() {
      await Promise.all(
        children.map((child) => {
          if (child.exitCode !== null || child.signalCode !== null) return undefined;
          const exited = new Promise((resolve) => child.once("exit", resolve));
          child.send({ kind: "close" });
          return exited;
        }),
      );
    },
  };
}

/** @typedef {{ subscribed: number, websocket: number }} Counts How many of the clients' connections are subscribed, and how many WebSocket carries */

/* A message to a child already gone: its exit is what the wait for its answer hears. */
function ignoreGone() {}

/* The first message of a child's that `matches`, or the probe stopped at the deadline. */
function next(child, matches, what) {
  return within(
    what,
    () => "no answer",
    (done, fail) => {
      const stop = () => {
        child.off("message", listen);
        child.off("exit", ended);
      };
      const listen = (message) => {
        if (!matches(message)) return;
        stop();
        done(message);
      };
      const ended = (code) => {
        stop();
        fail(new Error(`A child ended, code ${code}, before ${what}`));
      };
      child.on("message", listen);
      child.on("exit", ended);
    },
  );
}

function within(what, seen, wait) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gave up on ${what} after ${ANSWER_MS / 1000} s: ${seen()}`));
    }, ANSWER_MS);
    wait(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
