import type { ScopedLogger } from "../../logger";
import { ConnectionError } from "../errors";
import { transition } from "./connection-machine";
import type {
  MachineContext,
  MachineEffect,
  MachineEvent,
  MachineState,
} from "./connection-machine-types";
import { fingerprintOf } from "./credentials-fingerprint";
import type { WSCredentials } from "./ws-credentials";
import { encodeMessage } from "./ws-protocol";
import type { WSClientSocket, WSConnectionConfig, WSSocketFactory } from "./ws-types";

/** What the connection does for the runtime: its subscriptions' part of each transition. */
export interface RuntimeHooks {
  /** The `auth` frame went out on a socket that just opened: subscribe on it */
  opened(runtime: ConnectionRuntime): void;
  /** A message came on the socket */
  message(runtime: ConnectionRuntime, data: unknown): void;
  /** Effects about subscriptions, the liveness watch and the queue */
  effect(runtime: ConnectionRuntime, effect: MachineEffect): void;
}

/** What the runtime is made with. */
export interface RuntimeOptions {
  readonly config: WSConnectionConfig;
  readonly log: ScopedLogger;
  readonly factory: WSSocketFactory;
  /** The machine's timeouts and waits, given the time */
  readonly context: (now: number) => MachineContext;
  readonly hooks: RuntimeHooks;
}

/** A connection's state machine, running: its state, its socket, its timer. */
export interface ConnectionRuntime {
  readonly state: MachineState;
  /** Tell the machine what happened; events told while one is handled wait their turn. */
  dispatch(event: MachineEvent): void;
  /** Hand a frame to the socket. `false` when there is no open socket. */
  send(frame: string): boolean;
  /** What the socket has yet to put on the network, in bytes */
  readonly buffered: number;
  /** Hear each new state. */
  onChange(listener: (state: MachineState) => void): () => void;
}

/**
 * Run a connection's state machine: hand it each event in turn, keep the
 * one timer its state names — a phase's deadline, or the wait before a
 * reconnect — and do what each transition says about the socket and the
 * credentials. Everything a socket that is no longer the connection's does
 * is ignored, and so is an answer for credentials an attempt no longer
 * waits for.
 *
 * @param options - The connection's config, its hooks and its timing
 * @returns The running machine, idle until it is told `start`
 */
export function createConnectionRuntime(options: RuntimeOptions): ConnectionRuntime {
  const { config, log, factory, hooks } = options;
  const listeners = new Set<(state: MachineState) => void>();
  const pending: MachineEvent[] = [];
  let state: MachineState = { phase: "idle", failures: 0, authSeq: 0 };
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: WSClientSocket | undefined;
  let credentials: WSCredentials | undefined;
  let asked = 0;

  function dispatch(event: MachineEvent): void {
    pending.push(event);
    if (running) return;
    running = true;
    try {
      for (let next = pending.shift(); next; next = pending.shift()) {
        try {
          step(next);
        } catch (error) {
          /* One event's failure leaves the rest to be handled, and the connection running. */
          log.error(`A connection's ${next.type} event could not be handled`, error);
        }
      }
    } finally {
      running = false;
    }
  }

  function step(event: MachineEvent): void {
    const before = state;
    const result = transition(state, event, options.context(performance.now()));
    state = result.state;
    if (deadlineOf(state) !== deadlineOf(before)) rearm();
    for (const effect of result.effects) run(effect);
    if (state === before) return;
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        log.error("A connection's state listener failed", error);
      }
    }
  }

  function rearm(): void {
    clearTimeout(timer);
    timer = undefined;
    const deadline = deadlineOf(state);
    if (deadline === undefined) return;
    timer = setTimeout(() => dispatch({ type: deadline.fires }), deadline.ms);
  }

  function run(effect: MachineEffect): void {
    switch (effect.type) {
      case "ask-credentials":
        askCredentials();
        return;
      case "open-socket":
        openSocket();
        return;
      case "send-auth":
        send(encodeMessage({ type: "auth", id: effect.id, payload: credentials?.frame ?? {} }));
        credentials = undefined;
        if (effect.opening) hooks.opened(runtime);
        return;
      case "drop-socket":
        dropSocket(effect.code, effect.reason);
        return;
      default:
        hooks.effect(runtime, effect);
    }
  }

  function askCredentials(): void {
    const request = ++asked;
    const answer = (found: WSCredentials | undefined): void => {
      if (request !== asked) return;
      credentials = found;
      dispatch({ type: "credentials", fingerprint: fingerprintOf(found) });
    };
    const refuse = (error: unknown): void => {
      if (request !== asked) return;
      log.warn("The socket's credentials could not be had", error);
      dispatch({ type: "credentials-failed", error });
    };
    try {
      const found = config.credentials?.();
      if (found instanceof Promise) found.then(answer, refuse);
      else answer(found);
    } catch (error) {
      refuse(error);
    }
  }

  function openSocket(): void {
    let opened: WSClientSocket;
    try {
      opened = factory(config.url, config.protocols, credentials?.handshake);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "socket-failed",
        error: new ConnectionError(`The socket could not be made: ${reason}`),
      });
      return;
    }
    socket = opened;
    let error: unknown;
    let isOpen = false;
    const mine = (): boolean => socket === opened;
    const closed = (code: number, reason: string): void => {
      if (!mine()) return;
      socket = undefined;
      release(opened);
      dispatch({ type: "closed", closure: { code, reason }, announced: false, error });
    };
    opened.onopen = () => {
      isOpen = true;
      if (mine()) dispatch({ type: "socket-open" });
    };
    opened.onmessage = (event) => {
      if (mine()) hooks.message(runtime, event.data);
    };
    opened.onclose = (event) => closed(event.code, event.reason);
    /* What the error said is told with the close that follows it. Node 22's
       WebSocket reports a refused connection with an error alone, its socket
       left connecting, so one that has not opened is taken as closed — with
       1006, all a failed handshake ever says. */
    opened.onerror = (event) => {
      error = event;
      if (!isOpen) setTimeout(() => closed(1006, ""), 0);
    };
  }

  function dropSocket(code: number, reason: string): void {
    const dropped = socket;
    socket = undefined;
    if (dropped !== undefined) release(dropped, code, reason);
  }

  /* Let a socket go: nothing it does is heard any more. */
  function release(dropped: WSClientSocket, code?: number, reason?: string): void {
    dropped.onopen = dropped.onmessage = dropped.onclose = dropped.onerror = null;
    if (dropped.readyState >= 2) return;
    try {
      dropped.close(code, reason);
    } catch (error) {
      log.warn("A socket could not be closed", error);
    }
  }

  function send(frame: string): boolean {
    if (socket?.readyState !== 1) return false;
    socket.send(frame);
    return true;
  }

  const runtime: ConnectionRuntime = {
    get state() {
      return state;
    },
    get buffered() {
      return socket?.bufferedAmount ?? 0;
    },
    dispatch,
    send,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return runtime;
}

function deadlineOf(state: MachineState) {
  return "deadline" in state ? state.deadline : undefined;
}
