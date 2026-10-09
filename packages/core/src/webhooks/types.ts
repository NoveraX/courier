/** How a webhook's sender signs its deliveries, and how a delivery's signature is checked. */
export interface WebhookSignature {
  /** The scheme: `stripe`, `github`, `standard`, or `hmac` for one of your own */
  readonly scheme: string;
  /**
   * Whether a delivery is signed with the webhook's secret, and recent
   * enough not to be a replay.
   *
   * @param raw - The body exactly as it came
   * @param headers - The delivery's headers
   * @param now - The time now, in milliseconds
   */
  verify(raw: string, headers: Headers, now: number): Promise<boolean>;
  /**
   * The headers that sign a delivery, as the sender writes them — for a
   * mock or a test that delivers one.
   *
   * @param raw - The body as it is sent
   * @param now - The time now, in milliseconds
   */
  sign(raw: string, now: number): Promise<Record<string, string>>;
}

/** A webhook's secret: the text itself, or what reads it when a delivery comes. */
export type WebhookSecret = string | (() => string | undefined);

/** What a delivery's handler is given beside the event. */
export interface WebhookDelivery {
  /** The delivery as it came */
  request: Request;
  /** The event's name, when the webhook says how to read one: `charge.succeeded` */
  event: string | undefined;
}
