import { parseUrl } from "../utils/parse-url";

/** A webhook the application defined, as Studio has a delivery of it sent. */
export interface KnownWebhook {
  readonly name: string;
  readonly scheme: string;
  /** The headers that sign a body as the webhook's sender would, with its own secret. */
  sign(raw: string): Promise<Record<string, string>>;
  /** Where its deliveries came to in this process, newest last: `http://localhost:3000/api/webhooks/stripe`. */
  readonly routes: readonly string[];
}

interface Entry {
  name: string;
  scheme: string;
  sign: (raw: string) => Promise<Record<string, string>>;
  routes: string[];
}

interface Registry {
  webhooks: Map<string, Entry>;
  listeners: Set<() => void>;
}

/* One registry however many copies of this module load: a bundler's and Node's. */
const KEY = Symbol.for("courier.webhooks");
const g = globalThis as Record<symbol, unknown>;
if (!g[KEY]) g[KEY] = { webhooks: new Map(), listeners: new Set() } satisfies Registry;
const registry = g[KEY] as Registry;

/* Routes a webhook is mounted at are few; a delivery to another keeps the newest. */
const MOST_ROUTES = 8;

/**
 * Keep a webhook the application defines, under its name — a later
 * definition of the same name, as a reload makes, takes its place — so
 * Studio can have a delivery of it signed here, with the application's own
 * secret.
 *
 * @param webhook - Its name, its signature's scheme, and what signs a body
 * @example
 * ```ts
 * rememberWebhook({ name: "stripe", scheme: "stripe", sign: (raw) => signature.sign(raw, Date.now()) });
 * ```
 */
export function rememberWebhook(webhook: Omit<KnownWebhook, "routes">): void {
  const routes = registry.webhooks.get(webhook.name)?.routes ?? [];
  registry.webhooks.set(webhook.name, { ...webhook, routes });
  notify();
}

/**
 * Keep where a delivery of a webhook came to — its address without the
 * query — so a delivery Studio has sent goes where the application mounts
 * the webhook.
 *
 * @param name - The webhook's name
 * @param url - The delivery's address
 * @example
 * ```ts
 * rememberRoute("stripe", request.url);
 * ```
 */
export function rememberRoute(name: string, url: string): void {
  const entry = registry.webhooks.get(name);
  const address = parseUrl(url);
  if (!entry || !address) return;
  const route = `${address.origin}${address.pathname}`;
  if (entry.routes.at(-1) === route) return;
  entry.routes = [...entry.routes.filter((one) => one !== route), route].slice(-MOST_ROUTES);
  notify();
}

/**
 * The webhooks the application has defined, each with where its deliveries
 * came to.
 *
 * @returns Every webhook by its name
 * @example
 * ```ts
 * knownWebhooks().map((webhook) => webhook.name); // ["stripe", "github"]
 * ```
 */
export function knownWebhooks(): KnownWebhook[] {
  return [...registry.webhooks.values()].map((entry) => ({ ...entry, routes: [...entry.routes] }));
}

/**
 * Be told whenever a webhook is defined, or a delivery comes to a route not
 * seen before.
 *
 * @param listener - Called after each change
 * @returns What stops telling it
 * @example
 * ```ts
 * const stop = onKnownWebhooks(() => socket.emit("runtime:webhooks", knownWebhooks()));
 * ```
 */
export function onKnownWebhooks(listener: () => void): () => void {
  registry.listeners.add(listener);
  return () => registry.listeners.delete(listener);
}

function notify(): void {
  for (const listener of registry.listeners) listener();
}
