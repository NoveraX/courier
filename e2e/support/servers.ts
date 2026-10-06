import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { REPO } from "./project";

/** A server a test runs beside Studio. */
export interface TestServer {
  url: string;
  close(): Promise<void>;
}

/** Where the specification of the API the tests import is published, in either version. */
export interface SpecServer extends TestServer {
  publish(version: 1 | 2): void;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
    });
  });
}

function closing(server: Server): () => Promise<void> {
  return () => new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Publish the billing API's specification at `/billing.json`, version 1
 * until the test publishes another.
 *
 * @returns The server
 * @example
 * ```ts
 * const specs = await startSpecServer();
 * specs.publish(2);
 * ```
 */
export async function startSpecServer(): Promise<SpecServer> {
  let version: 1 | 2 = 1;
  const server = createServer((req, res) => {
    if (req.url !== "/billing.json") return void res.writeHead(404).end();
    const spec = readFileSync(join(REPO, `e2e/fixtures/specs/billing.v${version}.json`));
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(spec);
  });
  const url = await listen(server);
  const publish = (next: 1 | 2): void => {
    version = next;
  };
  return { url, close: closing(server), publish };
}

const USERS = [
  { id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
  { id: "u2", name: "Alan Turing", email: "alan@example.com", role: "member" },
];

/**
 * The shop's upstream: the users it holds, as `GET /users` and `GET /users/:id`.
 *
 * @returns The server
 * @example
 * ```ts
 * const upstream = await startUpstream();
 * ```
 */
export async function startUpstream(): Promise<TestServer> {
  const server = createServer((req, res) => {
    const id = /^\/users\/([^/?]+)/.exec(req.url ?? "")?.[1];
    const body = req.url === "/users" ? USERS : USERS.find((user) => user.id === id);
    res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(body ?? { message: "not found" }));
  });
  const url = await listen(server);
  return { url, close: closing(server) };
}
