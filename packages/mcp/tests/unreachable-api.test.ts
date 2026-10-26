/**
 * An agent whose call cannot reach the API is told why, against the
 * official client over HTTP: the code, and the host and port — whether
 * the call's own request got no answer or one the application's code made
 * on the way, as a source does that asks the API, before each call, which
 * user its paths name. A call whose time ran out is told so, and the
 * credentials in the API's address are never told.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { Agent, fetch as undiciFetch } from "undici";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createMcpHandler } from "../src";

const { endpoint } = courier();
/* A resolver that never answers holds the connection open until undici's
   connect timeout gives up on it — what a host behind a blocking network meets. */
const unreachable = new Agent({ connect: { timeout: 50, lookup: () => undefined } });
const servers: Server[] = [];
const clients: Client[] = [];
let refusingPort: number;

beforeAll(async () => {
  const closed = createServer();
  refusingPort = await listen(closed);
  await new Promise((resolve) => closed.close(resolve));
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const server of servers) server.closeAllConnections();
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});
afterAll(() => unreachable.close());

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

type Source = Pick<Parameters<typeof defineApi>[0], "baseURL" | "fetch" | "dispatcher"> & {
  userId?: () => Promise<string>;
};

/* An API whose every path names the user the call acts for. */
function siteRegistry({ userId = async () => "42", ...transport }: Source) {
  return defineApi({
    name: "sites",
    ...transport,
    pathOptions: async () => ({ userId: await userId() }),
    groups: {
      hosts: defineGroup({
        prefix: "v4/user/:userId/hosts",
        endpoints: {
          list: endpoint
            .get("")
            .agent({ description: "Every site the user added", access: "read" }),
        },
      }),
    },
  });
}

async function hostsListed(source: Source, timeoutMs?: number): Promise<string> {
  const mcp = createMcpHandler({
    sources: { sites: siteRegistry(source) },
    authorize: () => "owner",
    ...(timeoutMs !== undefined && { timeoutMs }),
  });
  const server = createServer(async (req, res) => {
    await sendWebResponse(await mcp.handle(toWebRequest(req, res)), res);
  });
  servers.push(server);
  const url = new URL(`http://127.0.0.1:${await listen(server)}/mcp`);
  const agent = new Client(
    { name: "sites-agent", version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  clients.push(agent);
  await agent.connect(new StreamableHTTPClientTransport(url) as never);
  const result = await agent.callTool({ name: "hosts_list", arguments: {} });
  expect(result.isError).toBe(true);
  return (result.content as { text: string }[]).map((part) => part.text).join("\n");
}

describe("a call that cannot reach the API", () => {
  it("names the code, the host and the port its connection timed out on", async () => {
    const told = await hostsListed({
      baseURL: "https://api.sites.example",
      fetch: undiciFetch,
      dispatcher: unreachable,
    });

    expect(told).toBe(
      "The API could not be reached: UND_ERR_CONNECT_TIMEOUT: " +
        "Connect Timeout Error (attempted address: api.sites.example:443, timeout: 50ms)",
    );
  });

  it("names them when the application's own request on the way got no answer", async () => {
    const askedOnTheWay = async () => {
      const answer = await undiciFetch("https://api.sites.example/v4/user", {
        headers: { authorization: "OAuth SECRET-TOKEN" },
        dispatcher: unreachable,
      });
      return String(((await answer.json()) as { user_id: number }).user_id);
    };

    const told = await hostsListed({
      baseURL: "https://api.sites.example",
      userId: askedOnTheWay,
    });

    expect(told).toBe(
      "The call failed: fetch failed\nCaused by: UND_ERR_CONNECT_TIMEOUT: " +
        "Connect Timeout Error (attempted address: api.sites.example:443, timeout: 50ms)",
    );
  });

  it("names the address and port that refused", async () => {
    const told = await hostsListed({ baseURL: `http://127.0.0.1:${refusingPort}` });

    expect(told).toBe(
      `The API could not be reached: connect ECONNREFUSED 127.0.0.1:${refusingPort}`,
    );
  });

  it("says fetch would not call a port it never calls, which it names no code for", async () => {
    const told = await hostsListed({ baseURL: "http://127.0.0.1:9" });

    expect(told).toBe("The API could not be reached: bad port");
  });

  it("tells the code alone, and no path, when the API's socket is a file", async () => {
    const socketPath =
      process.platform === "win32"
        ? "\\\\.\\pipe\\courier-missing-sites"
        : join(tmpdir(), "courier-missing", "sites.sock");
    const throughSocket = new Agent({ connect: { socketPath } });

    try {
      const told = await hostsListed({
        baseURL: "http://localhost",
        fetch: undiciFetch,
        dispatcher: throughSocket,
      });

      expect(told).toBe("The API could not be reached: ENOENT");
    } finally {
      await throughSocket.close();
    }
  });

  it("says the API's redirects never reached an answer", async () => {
    const looping = createServer((_request, response) => {
      response.writeHead(302, { location: "/" }).end();
    });
    servers.push(looping);

    const told = await hostsListed({ baseURL: `http://127.0.0.1:${await listen(looping)}` });

    expect(told).toBe("The API could not be reached: redirect count exceeded");
  });

  it("never tells the credentials in the API's address", async () => {
    const told = await hostsListed({
      baseURL: `http://ada:SECRET-PASSWORD@127.0.0.1:${refusingPort}`,
    });

    expect(told).toBe(
      "The API could not be reached: Request cannot be constructed from a URL that includes " +
        `credentials: http://127.0.0.1:${refusingPort}`,
    );
  });

  it.each(["'", '"', " "])(
    "never tells a password that %j splits, nor half of it",
    async (split) => {
      const told = await hostsListed({
        baseURL: `http://ada:pa55w0rd${split}pa55w0rd@127.0.0.1:${refusingPort}`,
      });

      expect(told).toBe(
        "The API could not be reached: Request cannot be constructed from a URL that includes " +
          `credentials: http://127.0.0.1:${refusingPort}`,
      );
    },
  );

  it("says the API did not answer in time when the call's time ran out", async () => {
    const silent = createServer(() => undefined);
    servers.push(silent);

    const told = await hostsListed({ baseURL: `http://127.0.0.1:${await listen(silent)}` }, 100);

    expect(told).toBe("The API did not answer in time: TIMEOUT: Request timed out after 100 ms");
  });
});
