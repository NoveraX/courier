/**
 * An upload through the proxy, parsed as it arrives: refused at the part
 * that breaks a limit, before the rest of it is read.
 */
import { describe, expect, it, vi } from "vitest";

import { createPostHandler } from "../src/adapter/handle-post";
import type { StudioHooks } from "../src/studio/hooks";
import { chunked, concat } from "./helpers/multipart-fixtures";

const hooks = () =>
  ({
    onProxyReceive: vi.fn(),
    onProxyParse: vi.fn(),
    onProxyRespond: vi.fn(),
    onProxyOriginReject: vi.fn(),
  }) as unknown as StudioHooks;

const B = "----courier-upload";

function upload(body: Uint8Array<ArrayBuffer>, cuts: number[] = [], boundary = B) {
  const { stream, pulls } = chunked(body, cuts);
  const request = new Request("http://localhost/api/request?_s=api&_m=upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body: stream,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
  return { request, pulls };
}

const field = (name: string, value: string): string =>
  `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

describe("an upload through the proxy", () => {
  it("is refused at its 1001st part, the parts limit, before the rest of it is read", async () => {
    const parts = concat(
      ...Array.from({ length: 10_000 }, (_, at) => field(`p${at}`, "v")),
      `--${B}--\r\n`,
    );
    const cuts = Array.from({ length: 1000 }, (_, at) => at * 512);
    const { request, pulls } = upload(parts, cuts);
    const run = vi.fn();

    const response = await createPostHandler(run, hooks())(request);
    const pulledWhenAnswered = pulls();

    expect(response.status).toBe(413);
    expect(((await response.json()) as { code: string }).code).toBe("UPLOAD_TOO_MANY_PARTS");
    expect(run).not.toHaveBeenCalled();
    expect(pulledWhenAnswered).toBeLessThan(200);
    /* The rest is taken off the connection after the answer, so a browser reads it. */
    await expect.poll(pulls).toBe(1001);
  });

  it("is refused with 400 BODY_MALFORMED when it does not parse", async () => {
    const { request } = upload(
      concat(field("a", "1"), `--${B}\r\nno headers here\r\n\r\nx\r\n--${B}--\r\n`),
    );

    const response = await createPostHandler(vi.fn(), hooks())(request);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("BODY_MALFORMED");
  });

  it("is refused, its body drained, when its Content-Type names no valid boundary", async () => {
    const { request, pulls } = upload(
      concat(field("a", "1"), `--${B}--\r\n`),
      [10, 20],
      "bad@boundary",
    );

    const response = await createPostHandler(vi.fn(), hooks())(request);

    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("BODY_MALFORMED");
    await expect.poll(pulls).toBe(4);
  });

  it("hands the call the caller's form and the options it carried first", async () => {
    const run = vi.fn().mockResolvedValue(new Response("{}"));
    const { request } = upload(
      concat(
        field("_options", '{"timeout":1000}'),
        field("note", "hi"),
        field("_options", "mine"),
        `--${B}--\r\n`,
      ),
    );

    await createPostHandler(run, hooks())(request);

    const { variables, options } = run.mock.calls[0]![1] as {
      variables: FormData;
      options: unknown;
    };
    expect(options).toEqual({ timeout: 1000 });
    expect([...variables.entries()]).toEqual([
      ["note", "hi"],
      ["_options", "mine"],
    ]);
  });
});
