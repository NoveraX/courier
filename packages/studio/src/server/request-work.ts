/** A connection a response's request came on, whose close says its caller has gone. */
interface Connection {
  once(event: "close", listener: () => void): unknown;
  off(event: "close", listener: () => void): unknown;
}

/** The part of a response a request's work follows. */
export interface WorkedResponse {
  /** `finish` comes once the whole answer has been sent, `close` once it is sent or its caller has gone. */
  once(event: "finish" | "close", listener: () => void): unknown;
  /** Whether the whole answer was sent before `close`. */
  readonly writableFinished: boolean;
  /** Whether the response has closed already, before its work was first asked for. */
  readonly closed?: boolean | undefined;
  /** Ends the answer; called through, so that the work knows when the route has written all of it. */
  end: (...args: never[]) => unknown;
  /** The connection, given once the answer may be written on it. */
  readonly socket?: Connection | null | undefined;
  /** The request, which knows its connection from the start. */
  readonly req?: { readonly socket?: Connection | null | undefined } | undefined;
}

/** What a request set going, which can outlast the connection it came on. */
export interface RequestWork {
  /** Aborted once the caller goes away before its answer is sent. */
  readonly signal: AbortSignal;
  /**
   * Count work as the request's own: the request is worked on until it settles.
   *
   * @param work - The work, already started
   * @returns The same work
   */
  hold<TResult>(work: Promise<TResult>): Promise<TResult>;
  /**
   * Settles once the route has written its whole answer — though it may still
   * be on its way, squeezed by compression or waiting for its caller to read
   * it — or once its caller has gone.
   */
  readonly written: Promise<void>;
  /**
   * Settles once every work held has settled and the whole answer has been
   * written, or its caller has gone: Studio has nothing left to do for the
   * request, though its caller may not have read it all.
   */
  readonly handedOver: Promise<void>;
  /**
   * Settles once every work held has settled and the answer has been sent,
   * or its caller has gone: the request holds nothing of Studio's any more.
   */
  readonly ended: Promise<void>;
}

const works = new WeakMap<WorkedResponse, RequestWork>();

/**
 * The work of the request a response answers, made the first time it is
 * asked for. A request is worked on for as long as anything it set going
 * runs, not for as long as its connection stays open: a caller that hangs
 * up stops nothing by itself. Its signal tells that work the caller has
 * gone, so it can stop. The caller has gone once the response closes
 * unsent, or once its connection does — the one sign of it for a request
 * that waits behind another on the same connection.
 *
 * @param res - The request's response
 * @returns Its work
 * @example
 * ```ts
 * const work = requestWork(res);
 * const text = await work.hold(fetchSpec(url, allowlist, { signal: work.signal }));
 * void requestWork(res).handedOver.then(release);
 * ```
 */
export function requestWork(res: WorkedResponse): RequestWork {
  let work = works.get(res);
  if (work === undefined) {
    work = startWork(res);
    works.set(res, work);
  }
  return work;
}

function startWork(res: WorkedResponse): RequestWork {
  const controller = new AbortController();
  const held = new Set<Promise<unknown>>();
  const closed = new Promise<void>((resolve) => {
    const connection = res.socket ?? res.req?.socket ?? undefined;
    const close = (): void => {
      connection?.off("close", close);
      if (!res.writableFinished) controller.abort(new Error("The caller went away."));
      resolve();
    };
    if (res.closed === true) {
      close();
      return;
    }
    res.once("close", close);
    connection?.once("close", close);
  });
  const written = Promise.race([closed, endOf(res)]);
  const sent = Promise.race([closed, new Promise<void>((resolve) => res.once("finish", resolve))]);
  return {
    signal: controller.signal,
    hold(work) {
      const settled = work.then(noop, noop);
      held.add(settled);
      void settled.then(() => held.delete(settled));
      return work;
    },
    written,
    handedOver: written.then(() => allSettled(held)),
    ended: sent.then(() => allSettled(held)),
  };
}

/* Settles once the route calls `end`: called through ahead of compression,
   which holds the answer's end back until its caller reads what came before. */
function endOf(res: WorkedResponse): Promise<void> {
  return new Promise((resolve) => {
    const end = res.end;
    res.end = (...args: never[]) => {
      resolve();
      return Reflect.apply(end, res, args);
    };
  });
}

/* Work held while the earlier work settled counts too. */
async function allSettled(held: ReadonlySet<Promise<unknown>>): Promise<void> {
  while (held.size > 0) await Promise.all(held);
}

function noop(): void {}
