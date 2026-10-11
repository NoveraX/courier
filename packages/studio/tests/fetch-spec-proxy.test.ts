/**
 * Behind a proxy, Studio fetches a specification as Node's own requests
 * would, once Node is told to use the proxy, and still checks each host
 * itself. A private address the project does not name is refused before the
 * proxy is asked. This machine is reached directly. A name only the proxy
 * can resolve goes through it, and a redirect through the proxy cannot lead
 * back to this machine. A public demo's visitor never goes through it, and a
 * proxy that refuses is named by its origin, never with its credentials.
 */
import type * as Dns from "node:dns";
import http, { createServer, type Server } from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { type ForwardProxy, startForwardProxy } from "../../core/tests/helpers/forward-proxy";
import { testCertificates } from "../../core/tests/helpers/test-certificates";
import type { SpecHostAllowlist } from "../src/server/spec-host-allowlist";

/* Names this test resolves itself; every other name resolves as usual. */
const RESOLVED = vi.hoisted(
  () => new Map<string, Array<{ address: string; family: number }> | Error>(),
);

vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof Dns>();
  const lookup = async (hostname: string, options: Dns.LookupAllOptions) => {
    const answer = RESOLVED.get(hostname);
    if (answer === undefined) return actual.promises.lookup(hostname, options);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { ...actual, promises: { ...actual.promises, lookup } };
});

const { fetchSpec } = await import("../src/server/fetch-spec");
const { specProxyFor } = await import("../src/server/spec-proxy");

const NOTHING_LISTED: SpecHostAllowlist = async () => ({ state: "listed", hosts: [] });
const PUBLIC = [{ address: "93.184.216.34", family: 4 }];
const unresolvable = (host: string) =>
  Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });

const nodeAgents = { http: http.globalAgent, https: https.globalAgent };
const hits: string[] = [];
let origin: Server;
let originPort: number;
let local: Server;
let localPort: number;
let proxy: ForwardProxy | undefined;

/* What Node does once NODE_USE_ENV_PROXY=1 is set: its global agents read the proxy variables. */
function turnOnNodeProxy(variables: Record<string, string>): void {
  const proxyEnv = {
    ...process.env,
    http_proxy: "",
    HTTP_PROXY: "",
    https_proxy: "",
    HTTPS_PROXY: "",
    no_proxy: "",
    NO_PROXY: "",
    ...variables,
  };
  Reflect.set(http, "globalAgent", new http.Agent({ proxyEnv }));
  Reflect.set(https, "globalAgent", new https.Agent({ proxyEnv }));
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

beforeAll(async () => {
  /* What the proxy reaches for every outside name. */
  origin = createServer((req, res) => {
    if (req.url === "/moved") {
      res.writeHead(302, { location: `http://127.0.0.1:${localPort}/spec.json` }).end();
      return;
    }
    res.end("openapi: 3.1.0 # from outside");
  });
  originPort = await listen(origin);
  /* This machine's own server. */
  local = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.end("openapi: 3.1.0 # from this machine");
  });
  localPort = await listen(local);
});

afterAll(async () => {
  for (const server of [origin, local]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

afterEach(async () => {
  Reflect.set(http, "globalAgent", nodeAgents.http);
  Reflect.set(https, "globalAgent", nodeAgents.https);
  RESOLVED.clear();
  hits.length = 0;
  vi.unstubAllEnvs();
  await proxy?.close();
  proxy = undefined;
});

async function behindProxy(refuse?: number, credentials = ""): Promise<ForwardProxy> {
  proxy = await startForwardProxy({
    refuse,
    reach: () => ({ host: "127.0.0.1", port: originPort }),
  });
  turnOnNodeProxy({
    HTTP_PROXY: proxy.url.replace("//", `//${credentials}`),
    HTTPS_PROXY: proxy.url.replace("//", `//${credentials}`),
  });
  return proxy;
}

describe("with Node's proxy on", () => {
  it("fetches through it from a host this machine resolves to a public address", async () => {
    const through = await behindProxy();
    RESOLVED.set("specs.example", PUBLIC);

    const text = await fetchSpec("http://specs.example/openapi.json", NOTHING_LISTED);

    expect(text).toBe("openapi: 3.1.0 # from outside");
    expect(through.seen).toEqual(["GET http://specs.example/openapi.json"]);
  });

  it("fetches through it from a name only the proxy can resolve", async () => {
    const through = await behindProxy();
    RESOLVED.set("hidden.example", unresolvable("hidden.example"));

    const text = await fetchSpec("http://hidden.example/openapi.json", NOTHING_LISTED);

    expect(text).toBe("openapi: 3.1.0 # from outside");
    expect(through.seen).toEqual(["GET http://hidden.example/openapi.json"]);
  });

  it("refuses a private host the project does not name, before the proxy is asked", async () => {
    const through = await behindProxy();
    RESOLVED.set("intranet.example", [{ address: "10.0.0.7", family: 4 }]);

    await expect(
      fetchSpec("http://intranet.example/openapi.json", NOTHING_LISTED),
    ).rejects.toMatchObject({
      code: "SPEC_HOST_PRIVATE",
    });
    expect(through.seen).toEqual([]);
  });

  it.each([
    ["an address", () => `http://127.0.0.1:${localPort}/spec.json`],
    ["a name", () => `http://localhost:${localPort}/spec.json`],
  ])(
    "reaches this machine, written as %s, directly and never through the proxy",
    async (_written, url) => {
      const through = await behindProxy();
      RESOLVED.set("localhost", [{ address: "127.0.0.1", family: 4 }]);

      const text = await fetchSpec(url(), NOTHING_LISTED);

      expect(text).toBe("openapi: 3.1.0 # from this machine");
      expect(through.seen).toEqual([]);
    },
  );

  it("follows no redirect that leads from a host through the proxy back to this machine", async () => {
    const through = await behindProxy();
    RESOLVED.set("specs.example", PUBLIC);

    await expect(fetchSpec("http://specs.example/moved", NOTHING_LISTED)).rejects.toMatchObject({
      code: "SPEC_HOST_PRIVATE",
    });
    expect(through.seen).toEqual(["GET http://specs.example/moved"]);
    expect(hits).toEqual([]);
  });

  it("sends nothing through it for a public demo's visitor", async () => {
    const through = await behindProxy();
    RESOLVED.set("hidden.example", unresolvable("hidden.example"));

    await expect(
      fetchSpec("http://hidden.example/openapi.json", NOTHING_LISTED, {}, "public"),
    ).rejects.toMatchObject({ code: "SPEC_UNREACHABLE" });
    expect(through.seen).toEqual([]);
  });

  it("names a proxy that refuses a tunnel by its origin, never with its credentials", async () => {
    const through = await behindProxy(407, "alice:s3cret@");
    RESOLVED.set("hidden.example", unresolvable("hidden.example"));

    const failure = await fetchSpec("https://hidden.example/openapi.json", NOTHING_LISTED).catch(
      (error: unknown) => error,
    );

    expect(through.seen).toEqual(["CONNECT hidden.example:443 (auth)"]);
    expect(failure).toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: `hidden.example could not be reached through the proxy at ${through.url} (the proxy answered 407 Refused). Give the proxy's credentials in its URL, as http://user:password@proxy:port.`,
    });
    expect(String((failure as Error).message)).not.toContain("s3cret");
  });

  it("says the proxy, not the host, refused a plain request with 407", async () => {
    const through = await behindProxy(407);
    RESOLVED.set("specs.example", PUBLIC);

    await expect(
      fetchSpec("http://specs.example/openapi.json", NOTHING_LISTED),
    ).rejects.toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: expect.stringContaining(
        `through the proxy at ${through.url} (the proxy answered 407`,
      ),
    });
  });
});

describe("the proxy a request goes through", () => {
  it("is none while Node's proxy is off, whatever the environment names", () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.corp:3128");

    expect(specProxyFor(new URL("https://specs.example/openapi.json"))).toBeUndefined();
  });

  it("is the one the environment names, by its origin alone", () => {
    turnOnNodeProxy({ HTTPS_PROXY: "http://alice:s3cret@proxy.corp:3128" });

    expect(specProxyFor(new URL("https://specs.example/openapi.json"))).toEqual({
      url: "http://alice:s3cret@proxy.corp:3128",
      origin: "http://proxy.corp:3128",
    });
  });

  it("is the lowercase variable's, as Node reads them", () => {
    turnOnNodeProxy({
      HTTPS_PROXY: "http://upper.corp:3128",
      https_proxy: "http://lower.corp:3128",
    });

    expect(specProxyFor(new URL("https://specs.example/"))?.origin).toBe("http://lower.corp:3128");
  });

  it("is none for a host NO_PROXY names", () => {
    turnOnNodeProxy({ HTTPS_PROXY: "http://proxy.corp:3128", NO_PROXY: ".example" });

    expect(specProxyFor(new URL("https://specs.example/"))).toBeUndefined();
  });

  it("is none for a proxy of another scheme, which Node leaves to the application", () => {
    turnOnNodeProxy({ HTTPS_PROXY: "socks5://proxy.corp:1080" });

    expect(specProxyFor(new URL("https://specs.example/"))).toBeUndefined();
  });

  it("refuses a variable that names no URL, without repeating what it holds", () => {
    /* Node refuses such a URL when it builds an agent; another library's agent may still hold one. */
    Reflect.set(https, "globalAgent", {
      options: { proxyEnv: { HTTPS_PROXY: "http://alice:s3cret@[broken" } },
    });

    expect(() => specProxyFor(new URL("https://specs.example/"))).toThrow(
      "HTTPS_PROXY does not name a URL, so Studio cannot fetch through the proxy.",
    );
  });
});

describe("a host whose certificate Node does not trust", () => {
  it("is reported with the way to trust its authority", async () => {
    const certificates = testCertificates();
    const server = https.createServer(certificates.server, (_req, res) => res.end("spec"));
    const port = await new Promise<number>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
    );

    const failure = fetchSpec(`https://127.0.0.1:${port}/spec.json`, NOTHING_LISTED);

    await expect(failure).rejects.toMatchObject({
      code: "SPEC_UNREACHABLE",
      message: expect.stringContaining("name that authority's certificate in NODE_EXTRA_CA_CERTS"),
    });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
