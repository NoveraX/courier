import { errorCode } from "./error-code";

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
 * Whether an error is a network failure whose text is known to say no more
 * than where a request went and why it got no answer. Node, undici and
 * OpenSSL write such a text themselves, from a fixed phrase and a host
 * name, an address, a port, a header's name or a certificate's names —
 * never from a request's headers, its body, or its address's path or query:
 *
 * - `getaddrinfo ENOTFOUND api.example.com`, `connect ECONNREFUSED 10.0.0.5:443`
 * - `Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)`
 * - `unable to verify the first certificate`, `wrong version number`
 *
 * A system call's failure that names a file — its `path` and `dest`, or a
 * Unix socket's or a pipe's path where the address it tried would be — is
 * the server's own business, not the network's, and is not one; nor is an
 * error of any other origin, whatever its text holds.
 *
 * @param error - A failure, or one of its causes
 * @returns Whether its text may be shown as it is
 * @example
 * ```ts
 * isNetworkReason(fetchError.cause); // true for undici's ConnectTimeoutError
 * isNetworkReason(new Error("GET /v4/user?key=… failed")); // false
 * ```
 */
export function isNetworkReason(error: Error): boolean {
  if (error instanceof AggregateError) return networkMembers(error).length > 0;
  const code = errorCode(error);
  if (code === undefined) return false;
  if (UNDICI.test(code) || NODE.test(code) || CERTIFICATE_VERDICTS.has(code)) return true;
  return (
    SYSTEM.test(code) &&
    typeof Reflect.get(error, "syscall") === "string" &&
    !("path" in error) &&
    !("dest" in error) &&
    !namesSocketFile(error)
  );
}

/**
 * The network failures an AggregateError gathered: Node tries each address
 * a host name resolved to, and gathers why each one refused.
 *
 * @param error - The gathered failure
 * @returns Those of its errors that are network reasons, in its order
 * @example
 * ```ts
 * networkMembers(refused).map((member) => member.message);
 * // ["connect ECONNREFUSED ::1:8080", "connect ECONNREFUSED 127.0.0.1:8080"]
 * ```
 */
export function networkMembers(error: AggregateError): Error[] {
  /* A program may set anything in their place; only a list holds failures. */
  const gathered: unknown = error.errors;
  if (!Array.isArray(gathered)) return [];
  return gathered.filter(
    (member: unknown): member is Error =>
      member instanceof Error && !(member instanceof AggregateError) && isNetworkReason(member),
  );
}

/* Where an address would be, Node puts the path of the Unix socket or the pipe it could not reach. */
function namesSocketFile(error: Error): boolean {
  const address: unknown = Reflect.get(error, "address");
  return address !== undefined && !(typeof address === "string" && IP_ADDRESS.test(address));
}
