import type { WebSocketLike } from "@noverax/courier";

/** Minimal Hono WSContext shape — avoids importing hono/ws */
export type HonoWSContext = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  /**
   * Platform-native socket. Every runtime hands over a different one — the
   * Node adapter's exposes no `bufferedAmount` at all — so nothing is promised
   * about its shape and the one field we want is read through a guard.
   */
  readonly raw?: unknown;
};

/** Back-pressure in bytes, for sockets that report it; 0 for those that do not. */
function bufferedBytes(raw: unknown): number {
  if (typeof raw !== "object" || raw === null || !("bufferedAmount" in raw)) return 0;
  const { bufferedAmount } = raw as { bufferedAmount: unknown };
  return typeof bufferedAmount === "number" ? bufferedAmount : 0;
}

type MsgHandler = (event: { data: unknown }) => void;
type CloseHandler = (event: { code: number }) => void;
type ErrHandler = (event: unknown) => void;

/** Bridge Hono callback-based WS to addEventListener-based WebSocketLike */
export function createSocketAdapter(
  ws: HonoWSContext,
): WebSocketLike & { emit(type: string, event: unknown): void } {
  const msg: MsgHandler[] = [];
  const close: CloseHandler[] = [];
  const err: ErrHandler[] = [];

  function addEventListener(type: "message", handler: MsgHandler): void;
  function addEventListener(type: "close", handler: CloseHandler): void;
  function addEventListener(type: "error", handler: ErrHandler): void;
  function addEventListener(
    type: "message" | "close" | "error",
    handler: MsgHandler | CloseHandler | ErrHandler,
  ): void {
    // Narrowing union handlers via switch — casts are safe per branch
    switch (type) {
      case "message":
        msg.push(handler as MsgHandler);
        break;
      case "close":
        close.push(handler as CloseHandler);
        break;
      case "error":
        err.push(handler as ErrHandler);
        break;
    }
  }

  return {
    send: (data: string) => ws.send(data),
    close: (code?: number, reason?: string) => ws.close(code, reason),
    get readyState() {
      return ws.readyState;
    },
    get bufferedAmount() {
      return bufferedBytes(ws.raw);
    },
    addEventListener,
    emit(type: string, event: unknown) {
      switch (type) {
        case "message":
          for (const fn of msg) fn(event as { data: unknown });
          break;
        case "close":
          for (const fn of close) fn(event as { code: number });
          break;
        case "error":
          for (const fn of err) fn(event);
          break;
      }
    },
  };
}
