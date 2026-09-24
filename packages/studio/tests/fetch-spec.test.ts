/**
 * Fetching a specification on the developer's behalf: this machine is
 * reachable, a private network is not unless the project names the host, and
 * no written-out address, hex form or redirect gets around that.
 */
import { createServer, type Server } from "node:http";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSpec } from "../src/server/fetch-spec";
import { requestSpec } from "../src/server/spec-request";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

interface Reply {
  status: number;
  body?: string | Buffer;
  location?: string;
  headers?: Record<string, string>;
  hang?: boolean;
}

async function serve(handler: (path: string) => Reply): Promise<string> {
  const server = createServer((req, res) => {
    const reply = handler(req.url ?? "/");
    if (reply.hang) return;
    res.writeHead(reply.status, { ...(reply.location ? { location: reply.location } : {}), ...reply.headers });
    res.end(reply.body ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe("fetchSpec", () => {
  it("reads a specification served on this machine", async () => {
    const base = await serve(() => ({ status: 200, body: '{"openapi":"3.1.0"}' }));

    expect(await fetchSpec(`${base}/openapi.json`, [])).toBe('{"openapi":"3.1.0"}');
  });

  it("follows a redirect on this machine", async () => {
    const base = await serve((path) => (path === "/old" ? { status: 301, location: "/new" } : { status: 200, body: "moved" }));

    expect(await fetchSpec(`${base}/old`, [])).toBe("moved");
  });

  it.each([
    "http://10.0.0.7/spec.json",
    "http://192.168.1.5/spec.json",
    "http://169.254.169.254/latest/meta-data",
    "http://100.100.100.100/spec.json",
    "http://[::ffff:169.254.169.254]/latest/meta-data",
    "http://[::ffff:a00:1]/spec.json",
    "http://[fe90::1]/spec.json",
    "http://[::a00:1]/spec.json",
    "http://[64:ff9b::a00:1]/spec.json",
    "http://[fd00::1]/spec.json",
  ])("refuses the private address %s", async (url) => {
    await expect(fetchSpec(url, [])).rejects.toMatchObject({ code: "SPEC_HOST_PRIVATE" });
  });

  it("refuses a redirect into a private network without following it", async () => {
    const base = await serve(() => ({ status: 302, location: "http://[::ffff:169.254.169.254]/latest/meta-data" }));

    await expect(fetchSpec(`${base}/spec.json`, [])).rejects.toMatchObject({ code: "SPEC_HOST_PRIVATE" });
  });

  it("stops after five redirects", async () => {
    const base = await serve((path) => ({ status: 302, location: `${path}x` }));

    await expect(fetchSpec(`${base}/`, [])).rejects.toMatchObject({ code: "SPEC_REDIRECTS" });
  });

  it("reports an error answer with its status", async () => {
    const base = await serve(() => ({ status: 404 }));

    await expect(fetchSpec(`${base}/missing.json`, [])).rejects.toMatchObject({
      code: "SPEC_HTTP_STATUS",
      message: `${base}/missing.json answered 404.`,
    });
  });

  it("refuses an address that means every interface, and anything but http or https", async () => {
    await expect(fetchSpec("http://0.0.0.0/spec.json", [])).rejects.toMatchObject({ code: "SPEC_URL_INVALID" });
    await expect(fetchSpec("file:///etc/passwd", [])).rejects.toMatchObject({ code: "SPEC_URL_INVALID" });
  });

  it("reads a body the server compressed with gzip or brotli", async () => {
    const spec = '{"openapi":"3.1.0"}';
    const base = await serve((path) =>
      path === "/gzip"
        ? { status: 200, body: gzipSync(spec), headers: { "content-encoding": "gzip" } }
        : { status: 200, body: brotliCompressSync(spec), headers: { "content-encoding": "br" } },
    );

    expect(await fetchSpec(`${base}/gzip`, [])).toBe(spec);
    expect(await fetchSpec(`${base}/br`, [])).toBe(spec);
  });

  it("drops a byte-order mark the file was saved with", async () => {
    const base = await serve(() => ({ status: 200, body: '\uFEFF{"openapi":"3.1.0"}' }));

    expect(await fetchSpec(`${base}/spec.json`, [])).toBe('{"openapi":"3.1.0"}');
  });

  it("follows a redirect from this machine to this machine by name", async () => {
    const base = await serve((path) => (path === "/" ? { status: 302, location: `${base.replace("127.0.0.1", "localhost")}/spec` } : { status: 200, body: "spec" }));

    expect(await fetchSpec(`${base}/`, [])).toBe("spec");
  });

  it("does not take a 300 or 304 for a redirect", async () => {
    const base = await serve((path) => ({ status: path === "/choices" ? 300 : 304, location: "/elsewhere" }));

    await expect(fetchSpec(`${base}/choices`, [])).rejects.toMatchObject({ code: "SPEC_HTTP_STATUS" });
    await expect(fetchSpec(`${base}/unchanged`, [])).rejects.toMatchObject({ code: "SPEC_HTTP_STATUS" });
  });

  it("reports a redirect to something that is not a URL as such", async () => {
    const base = await serve(() => ({ status: 302, location: "http://[::1" }));

    await expect(fetchSpec(`${base}/`, [])).rejects.toMatchObject({ code: "SPEC_URL_INVALID" });
  });

  it("reports a host it cannot reach, pointing a developer behind a proxy at the file import", async () => {
    const base = await serve(() => ({ status: 200 }));
    servers.pop()?.close();
    vi.stubEnv("HTTPS_PROXY", "http://proxy.example:3128");

    await expect(fetchSpec(`${base}/spec.json`, [])).rejects.toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: expect.stringContaining("download the file and import it from disk"),
    });
    vi.unstubAllEnvs();
  });

  it("gives up on a server that does not answer in time", async () => {
    const base = await serve(() => ({ status: 200, hang: true }));

    await expect(requestSpec(new URL(`${base}/spec.json`), { allowed: false, loopback: true }, 100)).rejects.toMatchObject({
      code: "SPEC_TIMEOUT",
    });
  });
});
