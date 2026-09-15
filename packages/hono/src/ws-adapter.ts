import type { WebSocketLike } from "@noverax/courier";

/** Minimal Hono WSContext shape — avoids importing hono/ws */
export type HonoWSContext = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  /** Platform-native socket (available in @hono/node-ws, Deno, Bun) */
  readonly raw?: { readonly bufferedAmount: number };
};

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
      return ws.raw?.bufferedAmount ?? 0;
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
