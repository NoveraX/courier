/**
 * Fetching a specification on the developer's behalf: this machine is
 * reachable, a private network is not unless the project names the host, and
 * no written-out address, hex form or redirect gets around that. The project
 * is asked which hosts it names only for a private address.
 */
import { createServer, type Server } from "node:http";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSpec } from "../src/server/fetch-spec";
import type { SpecHostAllowlist } from "../src/server/spec-host-allowlist";
import { requestSpec } from "../src/server/spec-request";

const servers: Server[] = [];

/* A project whose courier.config loads and names no private host. */
const NOTHING_LISTED: SpecHostAllowlist = async () => ({ state: "listed", hosts: [] });

function listing(...hosts: string[]) {
  return vi.fn<SpecHostAllowlist>(async () => ({ state: "listed", hosts }));
}

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

    expect(await fetchSpec(`${base}/openapi.json`, NOTHING_LISTED)).toBe('{"openapi":"3.1.0"}');
  });

  it("follows a redirect on this machine", async () => {
    const base = await serve((path) => (path === "/old" ? { status: 301, location: "/new" } : { status: 200, body: "moved" }));

    expect(await fetchSpec(`${base}/old`, NOTHING_LISTED)).toBe("moved");
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
    await expect(fetchSpec(url, NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_HOST_PRIVATE" });
  });

  it("refuses a redirect into a private network without following it", async () => {
    const base = await serve(() => ({ status: 302, location: "http://[::ffff:169.254.169.254]/latest/meta-data" }));

    await expect(fetchSpec(`${base}/spec.json`, NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_HOST_PRIVATE" });
  });

  it("stops after five redirects", async () => {
    const base = await serve((path) => ({ status: 302, location: `${path}x` }));

    await expect(fetchSpec(`${base}/`, NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_REDIRECTS" });
  });

  it("reports an error answer with its status", async () => {
    const base = await serve(() => ({ status: 404 }));

    await expect(fetchSpec(`${base}/missing.json`, NOTHING_LISTED)).rejects.toMatchObject({
      code: "SPEC_HTTP_STATUS",
      message: `${base}/missing.json answered 404.`,
    });
  });

  it("refuses an address that means every interface, and anything but http or https", async () => {
    await expect(fetchSpec("http://0.0.0.0/spec.json", NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_URL_INVALID" });
    await expect(fetchSpec("file:///etc/passwd", NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_URL_INVALID" });
  });

  it.each(["0.0.0.0", "[::]", "[::ffff:0:0]", "0.1.2.3"])(
    "refuses the unspecified address %s even when the project names it",
    async (host) => {
      /* Connecting to it reaches the services of this machine: the test's server among them. */
      const base = await serve(() => ({ status: 200, body: "reached" }));
      const port = new URL(base).port;
      const allowlist = listing(host, `${host}:${port}`);

      await expect(fetchSpec(`http://${host}:${port}/spec.json`, allowlist)).rejects.toMatchObject({
        code: "SPEC_URL_INVALID",
        message: expect.stringContaining("unspecified address"),
      });
    },
  );

  it("does not ask the project which hosts it names for this machine", async () => {
    const base = await serve(() => ({ status: 200, body: "spec" }));
    const allowlist = listing();

    expect(await fetchSpec(`${base}/spec.json`, allowlist)).toBe("spec");
    expect(allowlist).not.toHaveBeenCalled();
  });

  it("asks the project for a private address, and names the host it refused", async () => {
    const allowlist = listing("10.0.0.8");

    await expect(fetchSpec("http://10.0.0.7/spec.json", allowlist)).rejects.toMatchObject({
      code: "SPEC_HOST_PRIVATE",
      message: expect.stringContaining("Blocked request to private address: 10.0.0.7."),
    });
    expect(allowlist).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ state: "failing", failure: { code: "UNKNOWN", message: "boom", at: 0, cause: null } }, "CONFIG_NOT_LOADING", 409],
    [{ state: "starting" }, "STUDIO_STARTING", 503],
    [{ state: "reloading" }, "CONFIG_RELOADING", 503],
  ] as const)("refuses a private address while the project cannot say which hosts it names (%o)", async (hosts, code, httpStatus) => {
    const allowlist: SpecHostAllowlist = async () => hosts;

    await expect(fetchSpec("http://[fd00::1]/spec.json", allowlist)).rejects.toMatchObject({
      code,
      httpStatus,
      message: expect.stringContaining("Blocked request to private address: [fd00::1]."),
    });
  });

  it("advises creating courier.config for a private address in a project that has none", async () => {
    const allowlist: SpecHostAllowlist = async () => ({ state: "missing", root: "/work/app" });

    await expect(fetchSpec("http://10.0.0.7/spec.json", allowlist)).rejects.toMatchObject({
      code: "SPEC_HOST_PRIVATE",
      message: expect.stringContaining("There is no courier.config in /work/app; create it"),
    });
  });

  it("reads a body the server compressed with gzip or brotli", async () => {
    const spec = '{"openapi":"3.1.0"}';
    const base = await serve((path) =>
      path === "/gzip"
        ? { status: 200, body: gzipSync(spec), headers: { "content-encoding": "gzip" } }
        : { status: 200, body: brotliCompressSync(spec), headers: { "content-encoding": "br" } },
    );

    expect(await fetchSpec(`${base}/gzip`, NOTHING_LISTED)).toBe(spec);
    expect(await fetchSpec(`${base}/br`, NOTHING_LISTED)).toBe(spec);
  });

  it("drops a byte-order mark the file was saved with", async () => {
    const base = await serve(() => ({ status: 200, body: '\uFEFF{"openapi":"3.1.0"}' }));

    expect(await fetchSpec(`${base}/spec.json`, NOTHING_LISTED)).toBe('{"openapi":"3.1.0"}');
  });

  it("follows a redirect from this machine to this machine by name", async () => {
    const base = await serve((path) => (path === "/" ? { status: 302, location: `${base.replace("127.0.0.1", "localhost")}/spec` } : { status: 200, body: "spec" }));

    expect(await fetchSpec(`${base}/`, NOTHING_LISTED)).toBe("spec");
  });

  it("does not take a 300 or 304 for a redirect", async () => {
    const base = await serve((path) => ({ status: path === "/choices" ? 300 : 304, location: "/elsewhere" }));

    await expect(fetchSpec(`${base}/choices`, NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_HTTP_STATUS" });
    await expect(fetchSpec(`${base}/unchanged`, NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_HTTP_STATUS" });
  });

  it("reports a redirect to something that is not a URL as such", async () => {
    const base = await serve(() => ({ status: 302, location: "http://[::1" }));

    await expect(fetchSpec(`${base}/`, NOTHING_LISTED)).rejects.toMatchObject({ code: "SPEC_URL_INVALID" });
  });

  it("reports a host it cannot reach, pointing a developer behind a proxy at the file import", async () => {
    const base = await serve(() => ({ status: 200 }));
    servers.pop()?.close();
    vi.stubEnv("HTTPS_PROXY", "http://proxy.example:3128");

    await expect(fetchSpec(`${base}/spec.json`, NOTHING_LISTED)).rejects.toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: expect.stringContaining("download the file and import it from disk"),
    });
    vi.unstubAllEnvs();
  });

  it("gives up on a server that does not answer in time", async () => {
    const base = await serve(() => ({ status: 200, hang: true }));

    await expect(requestSpec(new URL(`${base}/spec.json`), { loopback: true, admitPrivate: async () => undefined }, 100)).rejects.toMatchObject({
      code: "SPEC_TIMEOUT",
    });
  });
});
