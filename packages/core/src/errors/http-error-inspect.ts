import { headersWithoutSecrets } from "../utils/redact/headers";
import type { HTTPError } from "./http-error";

/* Node's console, its loggers and its report of an uncaught error print an object through this. */
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

interface InspectOptions {
  readonly depth?: number | null | undefined;
}

type Inspect = (value: unknown, options: InspectOptions) => string;

/**
 * Give `HTTPError` the hook Node prints an object through — its console,
 * its loggers, its report of an uncaught error: the stack, then the code,
 * the status, the headers with every credential's value hidden, the body
 * and the cause. Defined on the prototype, beside the class: what prints an
 * error is no part of its type.
 *
 * A bundler that builds for the browser takes a stand-in that gives none,
 * as no browser's console reads Node's hook.
 *
 * @param prototype - `HTTPError.prototype`
 * @example
 * ```ts
 * defineNodePrinting(HTTPError.prototype);
 * ```
 */
export function defineNodePrinting(prototype: HTTPError): void {
  Object.defineProperty(prototype, INSPECT, { value: printed, writable: true, configurable: true });
}

function printed(
  this: HTTPError,
  depth: number,
  options: InspectOptions,
  inspect: Inspect,
): string {
  if (depth < 0) return `[${this.name}: ${this.message}]`;
  const fields = {
    code: this.code,
    ...(this.context !== undefined && { context: this.context }),
    status: this.status,
    headers: headersWithoutSecrets(this.headers),
    data: this.data,
    ...(this.cause !== undefined && { cause: this.cause }),
  };
  /* The fields sit where Node prints an error's own, at the depth the error is printed at. */
  return `${this.stack ?? `${this.name}: ${this.message}`} ${inspect(fields, { ...options, depth })}`;
}
