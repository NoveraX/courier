/**
 * What an agent is told when a request got no answer: why, as the system
 * said it — the code, and the host and port — for a connection that timed
 * out, a host name that does not resolve, a TLS handshake refused and a
 * port that refuses, a line for each cause. The failures are real ones,
 * from Node's `fetch` and undici's.
 *
 * And what it is never told: a request's headers, body, path or query; an
 * address's credentials; a header value or an argument the platform
 * refused; the text of a cause nothing vouches for; nor any credential
 * Studio cuts from an error's text before it leaves its page — the same
 * texts, platforms', databases' and APIs', in Studio's own corpus.
 */
import { lookup } from "node:dns";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { type AddressInfo, connect, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HTTPError } from "@noverax/courier";
import { Agent, fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { testCertificates } from "../../../core/tests/helpers/test-certificates";
import { PROSE, SECRETS } from "../../../studio-core/tests/secrets/error-text-corpus";
import { failureMessage } from "../../src/tools/failure-message";

/* A character UTF-16 writes as two code units, built from its code point. */
const TWO_UNITS = String.fromCodePoint(0x1f600);

/* A resolver that never answers holds the connection open until undici's
   connect timeout gives up on it — what a host behind a blocking network
   meets, in milliseconds rather than ten seconds. */
const unreachable = new Agent({ connect: { timeout: 50, lookup: () => undefined } });
const servers: Server[] = [];
let refusingPort: number;

beforeAll(async () => {
  const closed = await listen(createHttpServer());
  refusingPort = closed.port;
  await new Promise((resolve) => closed.server.close(resolve));
});
afterAll(async () => {
  await unreachable.close();
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

async function listen(server: Server): Promise<{ server: Server; port: number }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

async function serve(server: Server): Promise<number> {
  servers.push(server);
  return (await listen(server)).port;
}

async function rejectionOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("The call did not fail");
}

/* A socket no server listens on: a file's path, or a named pipe on Windows. */
function missingSocket(): string {
  return process.platform === "win32"
    ? "\\\\.\\pipe\\courier-missing"
    : join(tmpdir(), "courier-missing", "app.sock");
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Nothing was thrown");
}

describe("a request that got no answer", () => {
  it("names the code, the host and the port of a connection that timed out", async () => {
    const error = await rejectionOf(
      undiciFetch("https://api.example.com/v4/user", { dispatcher: unreachable }),
    );

    expect(failureMessage(error)).toBe(
      "The call failed: fetch failed\n" +
        "Caused by: UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.example.com:443, timeout: 50ms)",
    );
  });

  it("names the host whose name does not resolve", async () => {
    const error = await rejectionOf(fetch("http://courier-test.invalid/v4/user"));

    expect(failureMessage(error)).toMatch(
      /^The call failed: fetch failed\nCaused by: getaddrinfo E[A-Z_]+ courier-test\.invalid$/,
    );
  });

  it("names the address and the port that refused the connection", async () => {
    const error = await rejectionOf(fetch(`http://127.0.0.1:${refusingPort}/v4/user`));

    expect(failureMessage(error)).toBe(
      `The call failed: fetch failed\nCaused by: connect ECONNREFUSED 127.0.0.1:${refusingPort}`,
    );
  });

  it("names every address of a host that refused at each one", () => {
    const refusedAt = (address: string) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}:8080`), {
        errno: -61,
        code: "ECONNREFUSED",
        syscall: "connect",
        address,
        port: 8080,
      });
    /* As Node gathers them when it tries each address `localhost` resolved to. */
    const gathered = Object.assign(new AggregateError([refusedAt("::1"), refusedAt("127.0.0.1")]), {
      code: "ECONNREFUSED",
    });

    expect(failureMessage(new TypeError("fetch failed", { cause: gathered }))).toBe(
      "The call failed: fetch failed\n" +
        "Caused by: connect ECONNREFUSED ::1:8080; connect ECONNREFUSED 127.0.0.1:8080",
    );
  });

  it("says why a TLS handshake refused a certificate nothing trusted", async () => {
    const port = await serve(
      createHttpsServer({ ...testCertificates().server }, (_, response) => response.end("{}")),
    );

    const error = await rejectionOf(fetch(`https://127.0.0.1:${port}/v4/user`));

    expect(failureMessage(error)).toMatch(
      /^The call failed: fetch failed\nCaused by: UNABLE_TO_VERIFY_LEAF_SIGNATURE: unable to verify the first certificate/,
    );
  });

  it("tells OpenSSL's reason, not its error queue, when the server speaks no TLS", async () => {
    const port = await serve(createHttpServer((_, response) => response.end("{}")));

    const error = await rejectionOf(fetch(`https://127.0.0.1:${port}/v4/user`));

    expect(failureMessage(error)).toBe(
      "The call failed: fetch failed\nCaused by: ERR_SSL_WRONG_VERSION_NUMBER: wrong version number",
    );
  });

  it.each([
    ["a system call's", { code: "ECONNRESET", syscall: "read" }, "read ECONNRESET"],
    ["undici's", { code: "UND_ERR_SOCKET" }, "other side closed"],
    ["undici's HTTP parser's", { code: "HPE_INVALID_CONSTANT" }, "Expected HTTP/"],
    ["a socket's", { code: "ERR_SOCKET_CONNECTION_TIMEOUT" }, "Socket connection timeout"],
    ["TLS's", { code: "ERR_TLS_CERT_ALTNAME_INVALID" }, "Hostname/IP does not match"],
    ["a certificate's", { code: "CERT_HAS_EXPIRED" }, "certificate has expired"],
  ])("tells %s failure as a cause", (_, fields, message) => {
    const cause = Object.assign(new Error(message), fields);

    expect(failureMessage(new Error("Failed", { cause }))).toBe(
      `The call failed: Failed\nCaused by: ${message.includes(fields.code) ? "" : `${fields.code}: `}${message}`,
    );
  });

  it.each([
    ["Node's own about an argument", { code: "ERR_INVALID_URL", input: "x" }],
    ["a system call's about a file", { code: "ENOENT", syscall: "open", path: "/srv/key.json" }],
    ["one only shaped like a system call's", { code: "EAUTH" }],
    ["one with no code", {}],
  ])("leaves out a cause that is %s", (_, fields) => {
    const cause = Object.assign(new Error("SECRET-TEXT"), fields);

    expect(failureMessage(new Error("Failed", { cause }))).toBe("The call failed: Failed");
  });

  it("tells a failure that says nothing by its code or its name", () => {
    expect(failureMessage(new Error(""))).toBe("The call failed: Error");
    expect(failureMessage(Object.assign(new Error(""), { code: "ECONNRESET" }))).toBe(
      "The call failed: ECONNRESET",
    );
  });

  it("tells a failure whose message is no text by what it holds", () => {
    const counted = Object.assign(new Error("x"), { message: 42 });
    const blank = Object.assign(new Error("x"), { message: undefined });
    const cause = Object.assign(new Error("x"), {
      message: 42,
      code: "ECONNRESET",
      syscall: "read",
    });

    expect(failureMessage(counted)).toBe("The call failed: 42");
    expect(failureMessage(blank)).toBe("The call failed: Error");
    expect(failureMessage(new Error("Failed", { cause }))).toBe(
      "The call failed: Failed\nCaused by: ECONNRESET: 42",
    );
  });

  it("tells a gathered failure whose errors are no list by its code", () => {
    const gathered = Object.assign(new AggregateError([], ""), {
      errors: null,
      code: "ECONNREFUSED",
    });

    expect(failureMessage(gathered)).toBe("The call failed: ECONNREFUSED");
    expect(failureMessage(new TypeError("fetch failed", { cause: gathered }))).toBe(
      "The call failed: fetch failed",
    );
  });

  it("tells the network failures beneath the application's own, and its error statuses", async () => {
    const refused = await rejectionOf(fetch(`http://127.0.0.1:${refusingPort}/v4/user`));
    const lookedUp = new Error("Could not ask whose token this is", { cause: refused });
    const answered = new HTTPError({ status: 401, headers: new Headers(), data: {} });

    expect(failureMessage(lookedUp)).toBe(
      "The call failed: Could not ask whose token this is\n" +
        `Caused by: connect ECONNREFUSED 127.0.0.1:${refusingPort}`,
    );
    expect(failureMessage(new Error("The token was refused", { cause: answered }))).toBe(
      "The call failed: The token was refused\nCaused by: HTTP 401",
    );
  });
});

describe("what an agent is never told", () => {
  it("a request's headers, body, path and query", async () => {
    const error = await rejectionOf(
      undiciFetch("https://api.example.com/v4/user/42/hosts?key=SECRET-KEY#SECRET-FRAGMENT", {
        method: "POST",
        headers: { authorization: "OAuth SECRET-TOKEN", cookie: "session=SECRET-SESSION" },
        body: JSON.stringify({ password: "SECRET-BODY" }),
        dispatcher: unreachable,
      }),
    );

    const told = failureMessage(error);

    expect(told).toContain("api.example.com:443");
    expect(told).not.toMatch(/SECRET|v4|user\/42|key=/);
  });

  it("an address's credentials, path, query and fragment, in any text it is shown", async () => {
    const withCredentials = await rejectionOf(
      fetch(`http://ada:SECRET-PASSWORD@127.0.0.1:${refusingPort}/v4/user`),
    );
    const ownWords = new Error(
      "No answer from https://ada:SECRET-PASSWORD@api.example.com:8443/v4/user?key=SECRET-KEY#SECRET.",
    );

    expect(failureMessage(withCredentials)).toBe(
      "The call failed: Request cannot be constructed from a URL that includes credentials: " +
        `http://127.0.0.1:${refusingPort}`,
    );
    expect(failureMessage(ownWords)).toBe(
      "The call failed: No answer from https://api.example.com:8443.",
    );
  });

  it("an address too broken to read, whole", async () => {
    const error = await rejectionOf(fetch("http://api.exa mple.com/v4?key=SECRET-KEY&sig=SECRET"));

    expect(failureMessage(error)).toBe("The call failed: Failed to parse URL from [redacted]");
  });

  it("a path fetch could not read, but the query in it", async () => {
    const error = await rejectionOf(fetch("/v4/user/42/hosts?key=SECRET-KEY"));

    expect(failureMessage(error)).toBe(
      "The call failed: Failed to parse URL from /v4/user/42/hosts?[redacted]",
    );
  });

  it("a header value the platform refused", () => {
    const error = thrownBy(() => new Headers({ authorization: "Bearer SECRET\nTOKEN" }));

    const told = failureMessage(error);

    expect(told).toMatch(
      /^The call failed: Headers[\w. ]*: "\[redacted\]" is an invalid header value\.$/,
    );
    expect(told).not.toMatch(/SECRET|TOKEN|Bearer/);
  });

  it("an argument Node quotes when it refuses it", () => {
    const error = thrownBy(() =>
      lookup("localhost", { family: "SECRET-FAMILY" as never }, () => undefined),
    );

    expect(failureMessage(error)).toBe(
      "The call failed: ERR_INVALID_ARG_VALUE: The property 'options.family' must be one of: 0, 4, 6. Received [redacted]",
    );
  });

  it("the text of a cause nothing vouches for, and a file's path", async () => {
    const refused = await rejectionOf(fetch(`http://127.0.0.1:${refusingPort}/v4/user`));
    const sdk = new Error('GET /v4/user answered 500: {"token":"SECRET-TOKEN"}', {
      cause: refused,
    });
    const missing = thrownBy(() => readFileSync(join(tmpdir(), "courier-missing", "key.json")));

    expect(failureMessage(new Error("Could not ask for the user id", { cause: sdk }))).toBe(
      "The call failed: Could not ask for the user id\n" +
        `Caused by: connect ECONNREFUSED 127.0.0.1:${refusingPort}`,
    );
    expect(failureMessage(new Error("The key could not be read", { cause: missing }))).toBe(
      "The call failed: The key could not be read",
    );
  });

  it("the path of a socket the system could not connect to", async () => {
    const missing = await new Promise<unknown>((resolve) => {
      connect({ path: missingSocket() }).on("error", resolve);
    });

    expect(
      failureMessage(new Error("The local cache could not be asked", { cause: missing })),
    ).toBe("The call failed: The local cache could not be asked");
  });
});

describe("what Studio keeps from its own texts", () => {
  /* An answer that never came, as the client keeps why: the system's words under `data`. */
  const unanswered = (message: string) =>
    new HTTPError({ status: 0, headers: new Headers(), data: { success: false, message } });

  it.each(SECRETS)("is never told from %j", (text, secret) => {
    expect(failureMessage(new Error(text))).not.toContain(secret);
    expect(failureMessage(unanswered(text))).not.toContain(secret);
  });

  it.each(PROSE.filter((text) => !text.includes("://")))("tells %j as it was", (text) => {
    expect(failureMessage(new Error(text))).toBe(`The call failed: ${text.replace(/\s+/g, " ")}`);
  });
});

describe("how much an agent is told", () => {
  it("cuts a failure's text short, without splitting a character", () => {
    const long = new Error(`${"x".repeat(1_999)}${TWO_UNITS}${"y".repeat(3_000)}`);

    expect(failureMessage(long)).toBe(`The call failed: ${"x".repeat(1_999)}…`);
  });

  it("cuts each cause short, and tells four at most", () => {
    const informational = (message: string, cause?: Error) =>
      Object.assign(new Error(message, cause && { cause }), { code: "UND_ERR_INFO" });
    const long = informational("z".repeat(1_000));
    let chain = long;
    for (let level = 1; level <= 5; level++) chain = informational(`level ${level}`, chain);

    expect(failureMessage(new Error("Failed", { cause: chain })).split("\n")).toEqual([
      "The call failed: Failed",
      "Caused by: UND_ERR_INFO: level 5",
      "Caused by: UND_ERR_INFO: level 4",
      "Caused by: UND_ERR_INFO: level 3",
      "Caused by: UND_ERR_INFO: level 2",
    ]);
    expect(failureMessage(new Error("Failed", { cause: long }))).toBe(
      `The call failed: Failed\nCaused by: UND_ERR_INFO: ${"z".repeat(299)}…`,
    );
  });

  it("reads a text an upstream made long and odd in one pass", () => {
    /* Each run is one a pattern that backtracks reads again from each of its characters. */
    const odd = [
      ': "'.repeat(50_000),
      `${"a.".repeat(50_000)}://`,
      "?a".repeat(50_000),
      `http://x${")".repeat(50_000)}a`,
    ].join(" ");

    expect(failureMessage(new Error(odd))).toBe(
      `The call failed: ${': "'.repeat(50_000).slice(0, 1_999)}…`,
    );
  });

  it("ends a chain of causes that loops where it repeats", () => {
    const first = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
    const second = new Error("Retrying", { cause: first });
    first.cause = second;

    expect(failureMessage(second)).toBe(
      "The call failed: Retrying\nCaused by: UND_ERR_SOCKET: other side closed",
    );
  });
});
