/** How an upload the proxy sends on as it arrives stands. */
export interface UploadSending {
  /** Settles once the upload has ended: `true` when it was sent whole, `false` when it stopped short */
  readonly ended: Promise<boolean>;
  /** Whether it has been sent whole by now */
  whole(): boolean;
}

/* Each upload being sent on, known by the stream the call sends. */
const SENDING = new WeakMap<object, UploadSending>();

/**
 * Note how an upload sent on as it arrives stands, for the call that sends
 * it: its timeout starts once the upload has been sent whole, and a timeout
 * that ends it before then is the client's upload arriving too slowly.
 * Server code alone reaches this: no page sends such an upload.
 *
 * @param upload - The stream the call sends
 * @param sending - How it stands
 * @example
 * ```ts
 * trackSending(upload, encoding);
 * ```
 */
export function trackSending(upload: object, sending: UploadSending): void {
  SENDING.set(upload, sending);
}

/**
 * How a request's body stands, when it is an upload sent on as it arrives.
 *
 * @param body - A request's body, or a call's variables
 * @returns How it stands, or `undefined` for any other body
 * @example
 * ```ts
 * sendingOf(ctx.variables)?.whole(); // false while the client is still sending it
 * ```
 */
export function sendingOf(body: unknown): UploadSending | undefined {
  return typeof body === "object" && body !== null ? SENDING.get(body) : undefined;
}
