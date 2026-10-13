import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { requestWork } from "../src/server/request-work";

/* A response its test drives: answered and sent, written but unread, or its caller gone. */
function response(socket?: EventEmitter): EventEmitter & {
  writableFinished: boolean;
  socket?: EventEmitter;
  end(): void;
  answer(): void;
  handOver(): void;
  close(answered: boolean): void;
} {
  const res = Object.assign(new EventEmitter(), {
    writableFinished: false,
    ...(socket === undefined ? {} : { socket }),
    end(): void {},
    answer() {
      res.handOver();
      res.writableFinished = true;
      res.emit("finish");
      res.emit("close");
    },
    /* The route writes its whole answer; compression may still hold its end back. */
    handOver() {
      res.end();
    },
    close(answered: boolean) {
      res.writableFinished = answered;
      res.emit("close");
    },
  });
  return res;
}

function settles(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
  ]);
}

describe("requestWork", () => {
  it("is the same work each time a response is asked for it", () => {
    const res = response();

    expect(requestWork(res)).toBe(requestWork(res));
  });

  it("is aborted once its caller goes away before the answer is sent", () => {
    const res = response();
    const work = requestWork(res);

    res.close(false);

    expect(work.signal.aborted).toBe(true);
  });

  it("is not aborted once the answer was sent", () => {
    const res = response();
    const work = requestWork(res);

    res.answer();

    expect(work.signal.aborted).toBe(false);
  });

  it("ends once the response has closed and the work it holds has settled, not before", async () => {
    const res = response();
    const work = requestWork(res);
    let finish!: () => void;
    void work.hold(new Promise<void>((resolve) => (finish = resolve)));

    res.close(false);
    const beforeWorkEnded = await settles(work.ended);
    finish();

    expect(beforeWorkEnded).toBe(false);
    expect(await settles(work.ended)).toBe(true);
  });

  it("waits for work held while earlier work was settling", async () => {
    const res = response();
    const work = requestWork(res);
    let finishLater!: () => void;
    void work.hold(
      Promise.resolve().then(() => {
        void work.hold(new Promise<void>((resolve) => (finishLater = resolve)));
      }),
    );

    res.answer();
    const beforeLaterEnded = await settles(work.ended);
    finishLater();

    expect(beforeLaterEnded).toBe(false);
    expect(await settles(work.ended)).toBe(true);
  });

  it("ends once a held work fails, as when it succeeds", async () => {
    const res = response();
    const work = requestWork(res);
    const failing = work.hold(Promise.reject(new Error("the fetch failed")));

    res.close(false);

    await expect(failing).rejects.toThrow("the fetch failed");
    expect(await settles(work.ended)).toBe(true);
  });

  it("is handed over once its answer is, though its caller has not read it", async () => {
    const res = response();
    const work = requestWork(res);
    void work.hold(Promise.resolve());

    res.handOver();

    expect(await settles(work.handedOver)).toBe(true);
    expect(await settles(work.ended)).toBe(false);
  });

  it("is not handed over while the work it holds runs, though its answer was", async () => {
    const res = response();
    const work = requestWork(res);
    let finish!: () => void;
    void work.hold(new Promise<void>((resolve) => (finish = resolve)));

    res.handOver();
    const beforeWorkEnded = await settles(work.handedOver);
    finish();

    expect(beforeWorkEnded).toBe(false);
    expect(await settles(work.handedOver)).toBe(true);
  });

  it("is handed over and ended once its caller goes away before the answer", async () => {
    const res = response();
    const work = requestWork(res);

    res.close(false);

    expect(await settles(work.handedOver)).toBe(true);
    expect(await settles(work.ended)).toBe(true);
  });

  it("is written once its route ends the answer, before the answer is on its way", async () => {
    const res = response();
    const work = requestWork(res);
    const before = await settles(work.written);

    res.handOver();

    expect(before).toBe(false);
    expect(await settles(work.written)).toBe(true);
    expect(await settles(work.ended)).toBe(false);
  });

  it("is aborted once its connection closes, though its response never does", async () => {
    const connection = new EventEmitter();
    const res = response(connection);
    const work = requestWork(res);

    connection.emit("close");

    expect(work.signal.aborted).toBe(true);
    expect(await settles(work.handedOver)).toBe(true);
    expect(await settles(work.ended)).toBe(true);
  });

  it("is aborted at once when it is first asked for after its caller has gone", async () => {
    const res = Object.assign(response(), { closed: true });

    const work = requestWork(res);

    expect(work.signal.aborted).toBe(true);
    expect(await settles(work.ended)).toBe(true);
  });

  it("lets go of its connection once its response has closed, as one connection carries many", () => {
    const connection = new EventEmitter();
    const res = response(connection);
    const work = requestWork(res);

    res.answer();
    connection.emit("close");

    expect(connection.listenerCount("close")).toBe(0);
    expect(work.signal.aborted).toBe(false);
  });
});
