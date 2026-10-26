/**
 * Failures as Node, undici and OpenSSL raise them when a request got no
 * answer, and failures of any other origin shaped like them: one table
 * every rule that tells the network's failures from the rest is held to,
 * each in its own package's tests, so no two of them tell a failure apart
 * differently.
 */

type Failure = readonly [name: string, error: Error];

function failure(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), fields);
}

/* As Node raises it: a refused connection to one address a host name resolved to. */
function refusedAt(address: string): Error {
  return failure(`connect ECONNREFUSED ${address}:8080`, {
    errno: -61,
    code: "ECONNREFUSED",
    syscall: "connect",
    address,
    port: 8080,
  });
}

/** The network's failures: their text says where a request went and why it got no answer. */
export const NETWORK_FAILURES: readonly Failure[] = [
  ["a refused connection", refusedAt("10.0.0.5")],
  ["a refused connection to an IPv6 address", refusedAt("fe80::1%en0")],
  [
    "a host name that does not resolve",
    failure("getaddrinfo ENOTFOUND api.example.com", {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname: "api.example.com",
    }),
  ],
  ["a reset connection", failure("read ECONNRESET", { code: "ECONNRESET", syscall: "read" })],
  [
    "undici's connect timeout",
    failure("Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)", {
      code: "UND_ERR_CONNECT_TIMEOUT",
    }),
  ],
  ["undici's closed socket", failure("other side closed", { code: "UND_ERR_SOCKET" })],
  ["undici's HTTP parser", failure("Expected HTTP/", { code: "HPE_INVALID_CONSTANT" })],
  [
    "a socket's timeout",
    failure("Socket connection timeout", { code: "ERR_SOCKET_CONNECTION_TIMEOUT" }),
  ],
  [
    "a host name a certificate does not name",
    failure("Hostname/IP does not match certificate's altnames", {
      code: "ERR_TLS_CERT_ALTNAME_INVALID",
    }),
  ],
  [
    "OpenSSL's refused handshake",
    failure("80BF25F001000000:error:0A00010B:SSL routines::wrong version number", {
      code: "ERR_SSL_WRONG_VERSION_NUMBER",
      library: "SSL routines",
      reason: "wrong version number",
    }),
  ],
  ["an expired certificate", failure("certificate has expired", { code: "CERT_HAS_EXPIRED" })],
  [
    "a self-signed certificate",
    failure("self-signed certificate", { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }),
  ],
  [
    "each address of a host refusing",
    Object.assign(new AggregateError([refusedAt("::1"), refusedAt("127.0.0.1")], ""), {
      code: "ECONNREFUSED",
    }),
  ],
];

/** Failures of any other origin, whose text nothing vouches for, however their code reads. */
export const OTHER_FAILURES: readonly Failure[] = [
  [
    "a file the system could not open",
    failure("ENOENT: no such file or directory, open '/srv/app/key.json'", {
      code: "ENOENT",
      syscall: "open",
      path: "/srv/app/key.json",
    }),
  ],
  [
    "a file it could not link",
    failure("EEXIST: file already exists, link '/a' -> '/b'", {
      code: "EEXIST",
      syscall: "link",
      path: "/a",
      dest: "/b",
    }),
  ],
  [
    "a Unix socket no server listens on",
    failure("connect ENOENT /run/app/app.sock", {
      code: "ENOENT",
      syscall: "connect",
      address: "/run/app/app.sock",
    }),
  ],
  [
    "a Unix socket a relative path names",
    failure("connect ECONNREFUSED app.sock", {
      code: "ECONNREFUSED",
      syscall: "connect",
      address: "app.sock",
    }),
  ],
  [
    "a pipe no server listens on",
    failure("connect ENOENT \\\\.\\pipe\\app", {
      code: "ENOENT",
      syscall: "connect",
      address: "\\\\.\\pipe\\app",
    }),
  ],
  ["one only shaped like a system call's", failure("auth failed", { code: "EAUTH" })],
  [
    "a database's",
    failure('duplicate key value violates unique constraint "users_email_key"', { code: "23505" }),
  ],
  ["Node's own about an argument", failure("Invalid URL", { code: "ERR_INVALID_URL" })],
  ["one whose code is no identifier", failure("closed", { code: "UND_ERR SOCKET" })],
  ["one with no code", new Error("GET /v4/user?key=k3y failed")],
  [
    "a gathering of none of the network's",
    new AggregateError([new Error("no code"), failure("x", { code: "ENOENT", path: "/x" })], ""),
  ],
  [
    "a gathering whose errors are no list",
    Object.assign(new AggregateError([], ""), { errors: null, code: "ECONNREFUSED" }),
  ],
];
