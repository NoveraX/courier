import type { RealtimeError } from "../errors";
import type { ResumeSignal } from "../resume-signals";
import type { SocketClosure } from "./reconnect-classifier";

/** The protocol the server of an open socket speaks: 1 before Courier 0.5, 2 from it. */
export type ProtocolVersion = 1 | 2;

/** Why a connection is waiting to reconnect. */
export type ReconnectCause =
  /** The socket closed: before it opened, or while it was open */
  | {
      readonly kind: "closed";
      readonly code: number;
      readonly reason: string;
      readonly opened: boolean;
      /** What the socket's error event carried before it closed */
      readonly error?: unknown;
    }
  /** Nothing came from the server for this long */
  | { readonly kind: "silent"; readonly forMs: number }
  /** The socket did not open, or the server did not answer its credentials, in time */
  | { readonly kind: "timeout"; readonly waitingFor: "socket" | "admission" | "renewal" }
  /** The credentials could not be had */
  | { readonly kind: "credentials"; readonly error: unknown };

/**
 * Where a WebSocket connection stands. `status` reads the same in four words;
 * this says more, and why.
 */
export type WSConnectionState =
  | { readonly phase: "idle" }
  /** Its credentials are being asked for, or its socket is opening */
  | { readonly phase: "connecting"; readonly attempt: number }
  /** The socket is open, and the server has yet to admit it */
  | { readonly phase: "authenticating"; readonly attempt: number }
  | { readonly phase: "open"; readonly protocol: ProtocolVersion }
  /** Open, and proving who it is again */
  | { readonly phase: "reauthenticating"; readonly protocol: ProtocolVersion }
  | {
      readonly phase: "reconnecting";
      readonly attempt: number;
      readonly retryIn: number;
      readonly cause: ReconnectCause;
    }
  /** Ended: by the application's `close()`, or by the server, with nothing wrong */
  | { readonly phase: "closed"; readonly by: "client" | "server" }
  /** Refused for good; `reconnect()` tries again */
  | { readonly phase: "failed"; readonly error: RealtimeError };

/** A wait the connection is in, and the event its end is. */
export interface Deadline {
  readonly ms: number;
  readonly fires: "timeout" | "retry";
}

/** Credentials the server refused, kept to see whether those asked for next differ. */
export interface Refusal {
  readonly fingerprint: string;
  readonly error: RealtimeError;
  /** Whether the one attempt with other credentials was made */
  readonly retried: boolean;
}

/* What every phase keeps: attempts that failed in a row, the last auth id sent. */
interface Memory {
  readonly failures: number;
  readonly authSeq: number;
  readonly refusal?: Refusal | undefined;
}

/** A connection's state as its machine keeps it. */
export type MachineState =
  | (Memory & { readonly phase: "idle" })
  | (Memory & {
      readonly phase: "connecting";
      readonly socket: boolean;
      readonly fingerprint?: string | undefined;
      readonly deadline: Deadline;
    })
  | (Memory & {
      readonly phase: "authenticating";
      readonly authId: string;
      readonly fingerprint: string;
      readonly deadline: Deadline;
    })
  | (Memory & {
      readonly phase: "open";
      readonly protocol: ProtocolVersion;
      readonly openedAt: number;
      readonly fingerprint: string;
    })
  | (Memory & {
      readonly phase: "reauthenticating";
      readonly protocol: ProtocolVersion;
      readonly openedAt: number;
      readonly fingerprint: string;
      readonly authId: string;
      readonly deadline: Deadline;
    })
  | (Memory & {
      readonly phase: "reconnecting";
      readonly retryIn: number;
      readonly cause: ReconnectCause;
      readonly deadline: Deadline;
    })
  | (Memory & { readonly phase: "closed"; readonly by: "client" | "server" })
  | (Memory & { readonly phase: "failed"; readonly error: RealtimeError });

/** The state of one phase. */
export type Phase<TPhase extends MachineState["phase"]> = Extract<MachineState, { phase: TPhase }>;

/** What happens to a connection. */
export type MachineEvent =
  | { readonly type: "start" }
  | { readonly type: "credentials"; readonly fingerprint: string }
  | { readonly type: "credentials-failed"; readonly error: unknown }
  /** The socket could not even be made: an address or a policy the platform refuses */
  | { readonly type: "socket-failed"; readonly error: RealtimeError }
  | { readonly type: "socket-open" }
  | { readonly type: "admitted"; readonly protocol: ProtocolVersion }
  /** The server asked for the credentials again, or the application did */
  | { readonly type: "renewal-requested" }
  | { readonly type: "renewed" }
  /**
   * The socket closed, or the server said it is closing it — `announced`,
   * with the socket still to let go of
   */
  | {
      readonly type: "closed";
      readonly closure: SocketClosure;
      readonly announced: boolean;
      readonly error?: unknown;
    }
  | { readonly type: "silent"; readonly forMs: number }
  | { readonly type: "timeout" }
  | { readonly type: "retry" }
  | { readonly type: "reconnect" }
  | { readonly type: "resume"; readonly signal: ResumeSignal }
  | { readonly type: "close" };

/** What the connection does on a transition, in order. */
export type MachineEffect =
  | { readonly type: "ask-credentials" }
  | { readonly type: "open-socket" }
  /** The `auth` frame; on a socket that just opened, its subscriptions follow it */
  | { readonly type: "send-auth"; readonly id: string; readonly opening: boolean }
  | { readonly type: "drop-socket"; readonly code: number; readonly reason: string }
  /** The socket is gone: subscriptions wait for the next, each told `error` when there is one */
  | { readonly type: "subscriptions-wait"; readonly error?: RealtimeError | undefined }
  | { readonly type: "subscriptions-end"; readonly error?: RealtimeError | undefined }
  | { readonly type: "watch" }
  | { readonly type: "unwatch" }
  | { readonly type: "probe" }
  /** What waited for the connection to open goes out */
  | { readonly type: "flush" };

/** What a transition reads besides the state and the event. */
export interface MachineContext {
  readonly now: number;
  /**
   * The wait before an attempt: `step` 0 for the first after a connection
   * that worked or the first that failed, one more for each failure after
   */
  delay(step: number, hintMs?: number): number;
  /** The random wait before reconnecting on `online` */
  spread(): number;
  readonly connectTimeoutMs: number;
  readonly authTimeoutMs: number;
  readonly stableMs: number;
}

/** A transition: the next state — the same object when nothing changed — and what to do. */
export interface Step {
  readonly state: MachineState;
  readonly effects: readonly MachineEffect[];
}
