import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import type { User } from "./api";

const users: User[] = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
  { id: "2", name: "Alan Turing", email: "alan@example.com" },
];

/**
 * A REST backend that knows nothing of Courier: it could as well be written
 * in FastAPI, Rails or Go.
 *
 * @param port - Where it listens, on 127.0.0.1
 * @returns The listening server
 */
export function startUpstream(port = 4401): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/live/ticks") return streamTicks(req, res);
    const send = ([status, body]: [number, unknown]): void => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    answer(req).then(send, (error: unknown) => {
      console.error("The upstream failed to answer", error);
      send([500, { message: "Internal error" }]);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

/* Server-sent events, as any backend sends them: a tick a second until the caller leaves. */
function streamTicks(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  let n = 0;
  const tick = (): void => {
    n += 1;
    res.write(`data: ${JSON.stringify({ n, at: new Date().toISOString() })}\n\n`);
  };
  tick();
  const timer = setInterval(tick, 1000);
  req.on("close", () => clearInterval(timer));
}

async function answer(req: IncomingMessage): Promise<[number, unknown]> {
  const [, collection, id] = new URL(req.url ?? "/", "http://upstream").pathname.split("/");
  if (collection !== "users") return [404, { message: "Not found" }];
  if (req.method === "GET" && !id) return [200, users];
  if (req.method === "GET") {
    const user = users.find((u) => u.id === id);
    return user ? [200, user] : [404, { message: `No user ${id}` }];
  }
  if (req.method !== "POST" || id) return [405, { message: "Method not allowed" }];
  const input = jsonOf(await bodyOf(req));
  if (!isNewUser(input)) return [400, { message: "A user needs a name and an email" }];
  const user = { id: String(users.length + 1), name: input.name, email: input.email };
  users.push(user);
  return [201, user];
}

/* A body that is not JSON holds no user, and is answered 400 as one without its fields. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isNewUser(value: unknown): value is Omit<User, "id"> {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "email" in value &&
    typeof value.email === "string"
  );
}

async function bodyOf(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await startUpstream();
  console.log("Upstream at http://127.0.0.1:4401/users");
}
