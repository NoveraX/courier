import { createCaller, createProxyCaller } from "@noverax/courier";
import { defineConfig } from "@noverax/courier/config";
import { courier, defineApi, defineBoundary, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint, stream, channel } = courier();

export const User = z.object({ id: z.string(), name: z.string() });

const users = defineGroup({
  prefix: "users",
  endpoints: {
    list: endpoint
      .get("")
      .agent({ description: "List every user.", access: "read" })
      .response(z.array(User)),
    get: endpoint
      .get(":id")
      .variables(z.object({ id: z.string() }))
      .response(User),
    create: endpoint
      .post("")
      .variables(z.object({ name: z.string() }))
      .response(User),
    upload: endpoint.post("avatar").variables<FormData>().response<{ size: number }>(),
  },
});

const live = defineGroup({
  prefix: "live",
  endpoints: {
    ticks: stream.response<{ n: number }>().get("ticks"),
    chat: channel.send<{ text: string }>().response<{ text: string }>().connect("chat"),
  },
});

export const boundary = defineBoundary({
  source: "api",
  expose: { "users.list": "query", "users.create": "mutation", "live.ticks": "stream" },
});

export const api = defineApi({
  baseURL: "http://localhost:7001",
  boundary,
  groups: { users, live },
});

export const caller = createCaller(api);

export const browser = createProxyCaller<typeof api>("api", { boundary });

export const sources = { api };

// biome-ignore lint/style/noDefaultExport: a config is its module's default export, as courier.config.ts's is
export default defineConfig({ sources });
