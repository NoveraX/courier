import { ConfigurationError } from "../errors/configuration-error";
import { isRecord } from "../utils/is-record";
import { forwardOptionFor, headerNameProblem } from "./header-names";

const FLAGS = ["trace", "userAgent", "locale"] as const;
const FORWARD_KEYS: ReadonlySet<string> = new Set([
  ...FLAGS,
  "requestId",
  "clientAddress",
  "headers",
]);

/**
 * Refuse, where the API is defined, a `forward` that could not work as
 * written: a key it has no option for, a header name no request carries,
 * one that carries credentials or a connection's own headers, one that
 * claims a client's address outside `clientAddress`, or one that has an
 * option of its own.
 *
 * @param forward - The `forward` the API was defined with
 * @param where - The API, named in the error
 * @throws ConfigurationError `FORWARD_OPTIONS_INVALID`
 * @example
 * ```ts
 * assertForwardOptions({ requestId: "x-correlation-id", clientAddress: ["x-real-ip"] }, "api");
 * ```
 */
export function assertForwardOptions(forward: unknown, where: string): void {
  if (forward === undefined) return;
  const problem = forwardProblem(forward);
  if (problem !== undefined) {
    throw new ConfigurationError("FORWARD_OPTIONS_INVALID", `${where}: forward ${problem}`);
  }
}

function forwardProblem(forward: unknown): string | undefined {
  if (!isRecord(forward)) {
    return "is an object: { requestId, trace, clientAddress, userAgent, locale, headers }";
  }
  const unknown = Object.keys(forward).find((key) => !FORWARD_KEYS.has(key));
  if (unknown !== undefined) return `has no option "${unknown}"`;
  const flag = FLAGS.find((key) => forward[key] !== undefined && typeof forward[key] !== "boolean");
  if (flag !== undefined) return `${flag} is true or false`;
  return (
    namesProblem("requestId", forward.requestId) ??
    namesProblem("clientAddress", forward.clientAddress, "address") ??
    headersProblem(forward.headers)
  );
}

/* An option that is true, false, a header's name or a list of them. */
function namesProblem(
  option: "requestId" | "clientAddress",
  value: unknown,
  carries?: "address",
): string | undefined {
  if (value === undefined || typeof value === "boolean") return undefined;
  const names: unknown[] = Array.isArray(value) ? value : [value];
  if (names.length === 0) return `${option} names at least one header, or is true or false`;
  for (const name of names) {
    const problem = headerNameProblem(name, carries);
    if (problem !== undefined) return `${option} names its headers: ${problem}`;
  }
  return undefined;
}

function headersProblem(headers: unknown): string | undefined {
  if (headers === undefined) return undefined;
  if (!Array.isArray(headers)) return "headers is a list of header names";
  for (const name of headers as unknown[]) {
    const problem = headerNameProblem(name);
    if (problem !== undefined) return `headers: ${problem}`;
    const option = forwardOptionFor(name as string);
    if (option !== undefined)
      return `headers: "${String(name)}" has an option of its own, ${option}`;
  }
  return undefined;
}
