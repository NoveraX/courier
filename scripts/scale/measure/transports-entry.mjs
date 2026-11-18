/**
 * An entry in front of replicas, as a load balancer with no affinity is:
 * each request goes to the next replica in turn, and an upgrade is refused
 * with 403, as by an entry that lets no WebSocket through — until it is
 * told to let them through, when an upgrade goes to the next replica too
 * and the socket it opens is carried both ways. A replica taken out of the
 * turn is sent nothing from then on, while what it is answering runs on;
 * one that dies ends the answers it was giving. Its clients reach it on a
 * Unix socket, as clients on hosts of their own would: what it sends the
 * replicas holds one of the host's ephemeral ports a connection.
 */
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REFUSED = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

/**
 * Start an entry in front of the replicas listening on `ports`.
 *
 * @param {readonly number[]} ports - The replicas' ports, in the order of the turn
 * @returns {Promise<{ url: string, socketPath: string, remove: (port: number) => void, passUpgrades: () => void, close: () => Promise<void> }>} The entry, listening on `socketPath`
 * @example
 * ```js
 * const entry = await startEntry([a.port, b.port, c.port]);
 * entry.remove(a.port);
 * entry.passUpgrades();
 * ```
 */
export async function startEntry(ports) {
  const turn = [...ports];
  let next = 0;
  let passing = false;
  /* The sockets of the upgrades let through, which the server no longer holds. */
  const carried = new Set();
  const agent = new http.Agent({ keepAlive: true, maxSockets: Number.POSITIVE_INFINITY });
  const server = http.createServer((req, res) => {
    if (turn.length === 0) {
      res.writeHead(503, { "Content-Length": "0" }).end();
      return;
    }
    const port = turn[next++ % turn.length];
    const upstream = http.request(
      { host: "127.0.0.1", port, method: req.method, path: req.url, headers: req.headers, agent },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
        answer.on("error", () => res.destroy());
      },
    );
    upstream.on("error", () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(502, { "Content-Length": "0" }).end();
    });
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });
  server.on("upgrade", (request, socket, head) => {
    /* A client gone before it read the answer: nothing to tell it. */
    socket.on("error", () => {});
    if (!passing || turn.length === 0) {
      socket.end(REFUSED);
      return;
    }
    const port = turn[next++ % turn.length];
    const upstream = http.request({
      host: "127.0.0.1",
      port,
      method: request.method,
      path: request.url,
      headers: request.headers,
    });
    upstream.on("upgrade", (answer, through, ahead) => {
      through.on("error", () => socket.destroy());
      for (const each of [socket, through]) {
        carried.add(each);
        each.on("close", () => {
          carried.delete(each);
          socket.destroy();
          through.destroy();
        });
      }
      socket.write(headOf(answer));
      if (ahead.length > 0) socket.write(ahead);
      if (head.length > 0) through.write(head);
      through.pipe(socket).pipe(through);
    });
    upstream.on("response", (answer) => {
      answer.resume();
      socket.end(REFUSED);
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  const directory = mkdtempSync(join(tmpdir(), "courier-entry-"));
  const socketPath = join(directory, "entry.sock");
  await new Promise((resolve) => server.listen(socketPath, resolve));
  return {
    url: "ws://entry.localhost/ws",
    socketPath,
    remove(port) {
      const at = turn.indexOf(port);
      if (at !== -1) turn.splice(at, 1);
    },
    passUpgrades() {
      passing = true;
    },
    close() {
      agent.destroy();
      for (const socket of carried) socket.destroy();
      server.closeAllConnections();
      return new Promise((resolve) =>
        server.close(() => {
          rmSync(directory, { recursive: true, force: true });
          resolve();
        }),
      );
    },
  };
}

/* The head of a replica's answer to an upgrade, as the client is to read it. */
function headOf(answer) {
  const lines = [`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}`];
  for (let i = 0; i < answer.rawHeaders.length; i += 2) {
    lines.push(`${answer.rawHeaders[i]}: ${answer.rawHeaders[i + 1]}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}
