/**
 * An upload a source sends with its own fetch, which may be built on an
 * older undici than the runtime's: nothing tells which. A fetch built on
 * undici before 8 tees a body it may send again and keeps one branch while
 * it sends the other, so such a fetch is handed nothing to copy: the kept
 * branch of a form's body reads the body again, only once it is read, and a
 * stream read once goes told to follow no redirect.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { coreFetch } from "../src/utils/fetch";

afterEach(() => {
  vi.restoreAllMocks();
});

const bytes = (): Uint8Array<ArrayBuffer> => new Uint8Array(4000).fill(5);

describe("an upload through a source's own fetch", () => {
  it("sends a stream read once told to follow no redirect", async () => {
    const sent: RequestInit[] = [];
    const send = async (_url: string, init: RequestInit): Promise<Response> => {
      sent.push(init);
      await new Response(init.body).arrayBuffer();
      return new Response("{}");
    };

    await coreFetch("POST", "http://127.0.0.1:9/raw", {
      body: new Blob([bytes()]).stream(),
      fetch: send,
    });

    expect(sent.map((init) => init.redirect)).toEqual(["error"]);
  });

  it("gives a fetch that tees a form's body a branch that reads the body again, once read", async () => {
    const opened = vi.spyOn(Blob.prototype, "stream");
    const kept: ReadableStream<Uint8Array>[] = [];
    let sentBytes = new Uint8Array();
    /* As undici before 8 sends a body it may send again: teed, one branch kept for a redirect. */
    const send = async (_url: string, init: RequestInit): Promise<Response> => {
      const [copy, body] = (init.body as ReadableStream<Uint8Array>).tee();
      kept.push(copy);
      sentBytes = new Uint8Array(await new Response(body).arrayBuffer());
      return new Response("{}");
    };
    const form = new FormData();
    form.append("file", new File([bytes()], "a.bin"));

    await coreFetch("POST", "http://127.0.0.1:9/upload", { body: form, fetch: send });

    expect(opened).toHaveBeenCalledTimes(1);
    const copied = new Uint8Array(await new Response(kept[0]).arrayBuffer());
    expect(opened).toHaveBeenCalledTimes(2);
    expect(copied).toEqual(sentBytes);
    expect(sentBytes.length).toBeGreaterThan(bytes().length);
  });
});
