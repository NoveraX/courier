/* A code is an identifier — `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`; anything else in its place is none. */
const IDENTIFIER = /^[A-Za-z][\w.-]{0,63}$/;
/* undici's own failures and its HTTP parser's. */
const UNDICI = /^(?:UND_ERR_|HPE_)/;
/* Node's sockets and TLS layer, and OpenSSL's failures in a handshake. */
const NODE = /^ERR_(?:SOCKET|SSL|TLS)_/;
/* The names libuv and the resolver give a system call's failure. */
const SYSTEM = /^E[A-Z\d_]+$/;
/* An IPv4 or an IPv6 address, as a socket names the one it tried; a Unix
   socket and a pipe are named by their path in its place. */
const IP_ADDRESS = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[\da-f.]*:[\da-f:.]*(?:%[\w.-]+)?)$/i;

/* OpenSSL's verdicts on a server's certificate, as Node names them. */
const CERTIFICATE_VERDICTS: ReadonlySet<string> = new Set([
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_CRL",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "UNABLE_TO_DECRYPT_CRL_SIGNATURE",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY",
  "CERT_SIGNATURE_FAILURE",
  "CRL_SIGNATURE_FAILURE",
  "CERT_NOT_YET_VALID",
  "CERT_HAS_EXPIRED",
  "CRL_NOT_YET_VALID",
  "CRL_HAS_EXPIRED",
  "ERROR_IN_CERT_NOT_BEFORE_FIELD",
  "ERROR_IN_CERT_NOT_AFTER_FIELD",
  "ERROR_IN_CRL_LAST_UPDATE_FIELD",
  "ERROR_IN_CRL_NEXT_UPDATE_FIELD",
  "OUT_OF_MEM",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_CHAIN_TOO_LONG",
  "CERT_REVOKED",
  "INVALID_CA",
  "PATH_LENGTH_EXCEEDED",
  "INVALID_PURPOSE",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "HOSTNAME_MISMATCH",
]);

/**
 * Whether an error is the network's: a failure Node, undici or OpenSSL
 * raised when a request got no answer, whose text says where the request
 * went and why — `connect ECONNREFUSED 10.0.0.5:443`, `getaddrinfo
 * ENOTFOUND api.example.com`, `certificate has expired`. A system call's
 * failure that names a file — its `path` and `dest`, or a Unix socket's or
 * a pipe's path where the address it tried would be — is not one, nor is
 * an error of any other origin, however its code reads: a database's, an
 * SDK's, the app's own.
 *
 * It is the rule Courier's MCP server tells an agent a cause by; the tests
 * of both read one table of failures, so neither tells them apart
 * differently.
 *
 * @param error - An error in a failure's chain of causes
 * @returns Whether it is the network's
 * @example
 * ```ts
 * isNetworkFailure(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET", syscall: "read" })); // true
 * isNetworkFailure(Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT", syscall: "open", path: "/k" })); // false
 * ```
 */
export function isNetworkFailure(error: Error): boolean {
  if (isAggregate(error)) return networkMembers(error).length > 0;
  const code: unknown = Reflect.get(error, "code");
  if (typeof code !== "string" || !IDENTIFIER.test(code)) return false;
  if (UNDICI.test(code) || NODE.test(code) || CERTIFICATE_VERDICTS.has(code)) return true;
  return (
    SYSTEM.test(code) &&
    typeof Reflect.get(error, "syscall") === "string" &&
    !("path" in error) &&
    !("dest" in error) &&
    !namesSocketFile(error)
  );
}

/* The network's failures among those Node gathered from each address a host name resolved to. */
function networkMembers(error: AggregateError): Error[] {
  /* A program may set anything in their place; only a list holds failures. */
  const gathered: unknown = error.errors;
  if (!Array.isArray(gathered)) return [];
  return gathered.filter(
    (member: unknown): member is Error =>
      member instanceof Error && !isAggregate(member) && isNetworkFailure(member),
  );
}

/* Where an address would be, Node puts the path of the Unix socket or the pipe it could not reach. */
function namesSocketFile(error: Error): boolean {
  const address: unknown = Reflect.get(error, "address");
  return address !== undefined && !(typeof address === "string" && IP_ADDRESS.test(address));
}

/* Not every runtime has AggregateError; one that has none throws none. */
function isAggregate(error: Error): error is AggregateError {
  return typeof AggregateError === "function" && error instanceof AggregateError;
}
