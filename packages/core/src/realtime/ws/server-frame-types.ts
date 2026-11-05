/** What a server says went wrong, as a frame carries it. */
export interface FrameError {
  readonly code: number;
  readonly message: string;
  readonly issues?: readonly unknown[] | undefined;
}

/**
 * Where a topic's sequence stands for a subscription: the number of the
 * last event counted for it — delivered, sent again or skipped — in the
 * sequence `epoch` names. A new epoch starts the numbers over.
 */
export interface TopicPosition {
  readonly seq: number;
  readonly epoch: string;
}

/** How often a server pings a connection, and how long it waits for the answer. */
export interface ServerHeartbeat {
  readonly intervalMs: number;
  readonly timeoutMs: number;
}

/** A frame a server sends a client, its fields checked. */
export type ServerFrame =
  | { readonly type: "ping" }
  | { readonly type: "pong" }
  /** The `auth` with `id` was taken: the connection is admitted, or its credentials renewed */
  | {
      readonly type: "auth_ok";
      readonly id: string;
      /** The protocol the server speaks */
      readonly v: number;
      readonly connectionId: string;
      readonly heartbeat: ServerHeartbeat;
      readonly limits: { readonly maxMessageSize: number };
    }
  /** The connection was not admitted, or its credentials not renewed: the socket closes with `error.code` */
  | {
      readonly type: "auth_error";
      readonly id?: string | undefined;
      readonly error: FrameError;
      /** The protocol the server speaks */
      readonly v: number;
      readonly retryAfterMs?: number | undefined;
    }
  /** Send the credentials again, within `timeoutMs` — 0 for no deadline */
  | { readonly type: "reauth_required"; readonly timeoutMs: number }
  /** The server is closing the socket, with this code */
  | {
      readonly type: "disconnect";
      readonly code: number;
      readonly reason: string;
      readonly retryAfterMs?: number | undefined;
    }
  | { readonly type: "renamed"; readonly topic: string; readonly to: string }
  /** The subscription runs, the topic's events after `position` to come */
  | {
      readonly type: "subscribed";
      readonly topic: string;
      readonly id?: string | undefined;
      readonly position: TopicPosition;
      /** For a subscribe that sent `since`: whether every event it missed was sent before this */
      readonly recovered?: boolean | undefined;
    }
  | { readonly type: "unsubscribed"; readonly topic: string }
  | { readonly type: "complete"; readonly topic: string; readonly error?: FrameError | undefined }
  /** An event of the topic, numbered `seq`; or, without one, a frame for this connection alone */
  | {
      readonly type: "data";
      readonly topic?: string | undefined;
      readonly payload: unknown;
      readonly seq?: number | undefined;
    }
  /** The event `seq` of the topic was not sent to this connection: it was the one that sent it */
  | { readonly type: "skip"; readonly topic: string; readonly seq: number }
  /** The server cannot vouch for what came before: the topic goes on after `position` */
  | { readonly type: "resync"; readonly topic: string; readonly position: TopicPosition }
  | {
      readonly type: "error";
      readonly id?: string | undefined;
      readonly topic?: string | undefined;
      readonly error: FrameError;
    };

/** What reading one message gave: a frame, or why there is none. */
export type FrameReading =
  | { readonly frame: ServerFrame }
  /** A kind of frame this client does not know — a newer server's — ignored */
  | { readonly unknown: string }
  /** A message that is not a frame, or a frame with a field that does not hold */
  | { readonly invalid: string };
