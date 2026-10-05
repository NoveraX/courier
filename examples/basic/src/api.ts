import { courier, defineApi, defineGroup } from "@noverax/courier/define";

import { boundary } from "./boundary";
import { PROXY_PATH } from "./proxy-path";

const { endpoint, stream, channel } = courier();

export interface User {
  id: string;
  name: string;
  email: string;
}

/** A tick of the upstream's clock. */
export interface Tick {
  n: number;
  at: string;
}

/** A message in the chat. */
export interface ChatMessage {
  from: string;
  text: string;
}

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
    create: endpoint.post("").variables<{ name: string; email: string }>().response<User>(),
  },
});

const live = defineGroup({
  prefix: "live",
  endpoints: {
    /* The upstream's own server-sent events: a tick a second, for as long as the caller listens. */
    ticks: stream.response<Tick>().get("ticks"),
    /* The upstream has no sockets, so the application's server keeps the chat itself. */
    chat: channel
      .send<{ text: string }>()
      .response<ChatMessage>()
      .implement(() => ({
        onJoin(ctx) {
          ctx.send({ from: "server", text: "Welcome. Everything you send goes to everyone here." });
        },
        onMessage(ctx, message) {
          ctx.send({ from: "you", text: message.text });
          ctx.broadcast(ctx.topic, { from: "a guest", text: message.text });
        },
      })),
  },
});

/** The REST backend in `upstream.ts`, defined once for every caller. */
export const api = defineApi({
  baseURL: process.env.API_URL ?? "http://127.0.0.1:4401",
  proxyPath: PROXY_PATH,
  boundary,
  groups: { users, live },
});

/** The sources the proxy serves, under the name browser callers use. */
export const sources = { api };
