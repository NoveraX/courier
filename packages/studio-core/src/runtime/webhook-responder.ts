import {
  type KnownWebhook,
  knownWebhooks,
  onKnownWebhooks,
  parseUrl,
} from "@noverax/courier/internal";
import type { Socket } from "socket.io-client";

import { boundedText } from "./bounded-text";

/** What a runtime tells Studio of a webhook it can deliver. */
export interface AnnouncedWebhook {
  name: string;
  scheme: string;
  routes: string[];
}

type DeliveryAnswer = { ok: true; status: number } | { ok: false; error: string };

/* A handler that has not answered by then is not going to. */
const DELIVERY_TIMEOUT_MS = 30_000;
const LONGEST_ADDRESS = 2048;

/**
 * Let Studio have this application's webhooks delivered to it: tell Studio
 * which webhooks the application defines and where their deliveries came
 * to — on each connection, and whenever that changes — and answer
 * `webhook:deliver` by signing the body with the webhook's own secret, here
 * where the application keeps it, and sending it as its sender would.
 *
 * A delivery goes only where the webhook's deliveries came to, or to this
 * machine: signed here, it would let any other host deliver the same body
 * to the application.
 *
 * @param socket - The runtime's socket to Studio
 * @param send - What sends a delivery (default: the global `fetch`)
 * @returns What tells Studio again after a reconnection, and what stops telling it
 * @example
 * ```ts
 * const webhooks = answerWebhookDeliveries(socket);
 * socket.on("connect", webhooks.announce);
 * // Studio: socket.timeout(35_000).emit("webhook:deliver", { webhook, to, body }, (error, answer) => …)
 * ```
 */
export function answerWebhookDeliveries(
  socket: Pick<Socket, "on" | "emit" | "connected">,
  send: typeof fetch = fetch,
): { announce: () => void; stop: () => void } {
  const announce = () => {
    const webhooks: AnnouncedWebhook[] = knownWebhooks().map(({ name, scheme, routes }) => ({
      name,
      scheme,
      routes: [...routes],
    }));
    /* A runtime that defines none, as a browser's, has nothing to say. */
    if (socket.connected && webhooks.length > 0) socket.emit("runtime:webhooks", { webhooks });
  };
  const stop = onKnownWebhooks(announce);
  socket.on("webhook:deliver", async (asked: unknown, answer: unknown): Promise<void> => {
    if (typeof answer === "function") answer(await deliveryOf(asked, send));
  });
  return { announce, stop };
}

async function deliveryOf(asked: unknown, send: typeof fetch): Promise<DeliveryAnswer> {
  const webhook = field(asked, "webhook");
  const to = field(asked, "to");
  const body = field(asked, "body");
  if (typeof webhook !== "string" || typeof to !== "string" || body === undefined) {
    return {
      ok: false,
      error: "Studio asked for a delivery without its webhook, address and body.",
    };
  }
  const known = knownWebhooks().find((one) => one.name === webhook);
  if (!known) return { ok: false, error: `This application defines no webhook named ${webhook}.` };
  const refusal = refusedAddress(to, known);
  if (refusal) return { ok: false, error: refusal };
  const raw = JSON.stringify(body);
  try {
    const signed = await known.sign(raw);
    const response = await send(to, {
      method: "POST",
      headers: { "content-type": "application/json", ...signed },
      body: raw,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    /* How the handler answered is Studio's already, in the delivery's own events. */
    await response.body?.cancel();
    return { ok: true, status: response.status };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: boundedText(`The delivery to ${to} failed: ${reason}`) };
  }
}

/* Why a delivery may not go there, or `undefined` when it may. */
function refusedAddress(to: string, known: KnownWebhook): string | undefined {
  const address = to.length > LONGEST_ADDRESS ? undefined : parseUrl(to);
  if (address === undefined) return `${to} is not an address.`;
  const { protocol, hostname, origin, pathname } = address;
  if (protocol !== "http:" && protocol !== "https:")
    return `${to} is not an http or https address.`;
  if (isLoopback(hostname) || known.routes.includes(`${origin}${pathname}`)) return undefined;
  return `${to} is neither on this machine nor where the ${known.name} webhook's deliveries came to: a delivery signed here goes to one of those only.`;
}

function field(asked: unknown, key: string): unknown {
  return typeof asked === "object" && asked !== null ? Reflect.get(asked, key) : undefined;
}

function isLoopback(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(name)
  );
}
