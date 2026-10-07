import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { listen, type Served } from "./listen";

/** One request the API received, as it arrived. */
export interface Received {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
}

/**
 * The API every application calls: it keeps a session in a cookie, asks a
 * write for a double-submit token, renews and ends sessions with cookies of
 * its own, and records every request it receives at `/__log`, which
 * `?clear=1` empties.
 *
 * @param spaOrigin - The origin of the single-page application, which calls it with credentials
 * @returns The running API
 * @example
 * ```ts
 * const api = await startApi("http://127.0.0.1:5173");
 * ```
 */
export function startApi(spaOrigin: string): Promise<Served> {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    if (allowedCors(req, res, spaOrigin)) return;
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const [path = "/", query = ""] = (req.url ?? "/").split("?");
      if (path === "/__log") {
        if (query.includes("clear=1")) received.length = 0;
        return send(res, 200, received);
      }
      received.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
      answer(req, res, path, body, req.headers.origin === spaOrigin);
    });
  });
  return listen(server);
}

/* The single-page application calls with its cookies, across origins. */
function allowedCors(req: IncomingMessage, res: ServerResponse, spaOrigin: string): boolean {
  if (req.headers.origin !== spaOrigin) return false;
  res.setHeader("access-control-allow-origin", spaOrigin);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("vary", "Origin");
  if (req.method !== "OPTIONS") return false;
  res.setHeader("access-control-allow-methods", "GET, POST");
  res.setHeader("access-control-allow-headers", "content-type, x-csrftoken");
  res.writeHead(204).end();
  return true;
}

function answer(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  body: string,
  fromSpa: boolean,
): void {
  const jar = cookiesOf(req.headers.cookie);
  const seen = {
    sid: jar.get("sid") ?? null,
    cookie: req.headers.cookie ?? null,
    requestId: req.headers["x-request-id"] ?? null,
    referer: req.headers.referer ?? null,
  };
  const route = `${req.method} ${path}`;
  if (route === "GET /me") send(res, 200, seen, jar.get("sid") === "expiring" ? [RENEWED] : []);
  else if (route === "GET /products") send(res, 200, [{ id: 1, title: "Notebook" }]);
  else if (route === "GET /b64") send(res, 200, seen, ["sid=YWJj+ZGVm/==; Path=/"]);
  else if (route === "POST /login") signIn(res, body, fromSpa);
  else if (route === "POST /logout") send(res, 200, { ok: true }, ["sid=; Path=/; Max-Age=0"]);
  else if (route === "POST /me/name") rename(req, res, jar, { ...seen, renamed: nameOf(body) });
  else send(res, 404, { error: "not found", route });
}

/* The API renews a session about to expire, for its own paths. */
const RENEWED = "sid=renewed; Path=/api; HttpOnly; SameSite=Lax";

/* A write needs the session, and the double-submit token repeated from its cookie. */
function rename(
  req: IncomingMessage,
  res: ServerResponse,
  jar: ReadonlyMap<string, string>,
  renamed: unknown,
): void {
  const token = jar.get("csrftoken");
  if (!jar.has("sid")) send(res, 401, { error: "no session" });
  else if (token === undefined || req.headers["x-csrftoken"] !== token) {
    send(res, 403, { error: "CSRF check failed" });
  } else send(res, 200, renamed);
}

/* A server that relays the session sets it for its own pages; a browser keeps it as the API names it. */
function signIn(res: ServerResponse, body: string, fromSpa: boolean): void {
  const user = userOf(body);
  send(res, 200, { ok: true, user }, [
    `sid=s%3A${user}.sig; Path=${fromSpa ? "/" : "/api"}; HttpOnly; SameSite=Lax`,
    `csrftoken=t-${user}; Path=/`,
    "vendor_tracking=1; Path=/",
  ]);
}

function send(res: ServerResponse, status: number, body: unknown, cookies: string[] = []): void {
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function cookiesOf(header: string | undefined): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return jar;
}

function userOf(body: string): string {
  const parsed: unknown = body === "" ? {} : JSON.parse(body);
  const user =
    typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "user") : undefined;
  return typeof user === "string" ? user : "ada";
}

function nameOf(body: string): string | undefined {
  const parsed: unknown = body === "" ? {} : JSON.parse(body);
  const name =
    typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "name") : undefined;
  return typeof name === "string" ? name : undefined;
}
