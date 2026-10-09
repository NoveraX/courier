import type { Socket } from "socket.io";

import { isPlainObject } from "../is-plain-object";

/** A webhook an attached application can have delivered, as the pages list it. */
export interface DirectoryWebhook {
  name: string;
  /** How its sender signs a delivery: `stripe`, `github`, `standard`, `hmac`. */
  scheme: string;
  /** Where its deliveries came to, newest last. */
  routes: string[];
  /** The applications that define it, by their runtime's id. */
  apps: string[];
}

/** The webhooks each attached application defines, and which one delivers a webhook. */
export interface WebhookDirectory {
  /** Keep what a runtime said it defines, in place of what it said before. */
  announce(socket: Socket, runtimeId: string, raw: unknown): void;
  /** Forget a runtime's webhooks: its socket closed. */
  forget(socket: Socket): void;
  list(): DirectoryWebhook[];
  /** The connected runtime that told of the webhook last, which delivers it. */
  socketFor(name: string): Socket | undefined;
}

interface Told {
  runtimeId: string;
  at: number;
  webhooks: ReadonlyArray<Omit<DirectoryWebhook, "apps">>;
}

/* As many as an application defines, and the routes it mounts them at. */
const MOST_WEBHOOKS = 200;
const MOST_ROUTES = 8;
const LONGEST_TEXT = 2048;

/**
 * The webhooks the attached applications define, as each runtime that
 * presented this project's token tells them: only such a runtime is asked
 * to deliver one, since it signs the delivery with the application's own
 * secret.
 *
 * @returns The directory
 * @example
 * ```ts
 * const webhooks = createWebhookDirectory();
 * socket.on("runtime:webhooks", (raw) => webhooks.announce(socket, runtimeId, raw));
 * ```
 */
export function createWebhookDirectory(): WebhookDirectory {
  const told = new Map<Socket, Told>();
  let order = 0;
  return {
    announce(socket, runtimeId, raw) {
      told.set(socket, { runtimeId, at: ++order, webhooks: webhooksOf(raw) });
    },
    forget(socket) {
      told.delete(socket);
    },
    list() {
      const byName = new Map<string, DirectoryWebhook>();
      for (const { runtimeId, webhooks } of [...told.values()].sort((a, b) => a.at - b.at)) {
        for (const webhook of webhooks) {
          const known = byName.get(webhook.name);
          const routes = [...(known?.routes ?? []), ...webhook.routes];
          byName.set(webhook.name, {
            name: webhook.name,
            scheme: webhook.scheme,
            routes: [...new Set(routes.reverse())].reverse().slice(-MOST_ROUTES),
            apps: [...new Set([...(known?.apps ?? []), runtimeId])],
          });
        }
      }
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    socketFor(name) {
      let latest: { socket: Socket; at: number } | undefined;
      for (const [socket, entry] of told) {
        if (!socket.connected || !entry.webhooks.some((one) => one.name === name)) continue;
        if (!latest || entry.at > latest.at) latest = { socket, at: entry.at };
      }
      return latest?.socket;
    },
  };
}

function webhooksOf(raw: unknown): Told["webhooks"] {
  const listed = isPlainObject(raw) && Array.isArray(raw.webhooks) ? raw.webhooks : [];
  return listed.slice(0, MOST_WEBHOOKS).flatMap((one: unknown) => {
    if (!isPlainObject(one) || !isText(one.name) || !isText(one.scheme)) return [];
    const routes = Array.isArray(one.routes) ? one.routes.filter(isHttpAddress) : [];
    return [{ name: one.name, scheme: one.scheme, routes: routes.slice(-MOST_ROUTES) }];
  });
}

function isHttpAddress(value: unknown): value is string {
  return isText(value) && URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= LONGEST_TEXT;
}
