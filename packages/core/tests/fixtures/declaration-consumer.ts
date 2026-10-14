import { createCaller, createProxyCaller } from "@noverax/courier";
import { defineConfig } from "@noverax/courier/config";
import {
  type CourierRoutes,
  courier,
  defineApi,
  defineGroup,
  type RouteMap,
} from "@noverax/courier/define";
import { z } from "zod";

const { endpoint, stream, channel } = courier();

export const User = z.object({ id: z.string(), name: z.string() });

const users = defineGroup({
  prefix: "users",
  endpoints: {
    list: endpoint
      .get("")
      .agent({ description: "List every user.", access: "read" })
      .response(z.array(User))
      .expose(),
    get: endpoint
      .get(":id")
      .variables(z.object({ id: z.string() }))
      .response(User),
    create: endpoint
      .post("")
      .variables(z.object({ name: z.string() }))
      .response(User)
      .expose(),
    upload: endpoint.post("avatar").variables<FormData>().response<{ size: number }>(),
  },
});

const live = defineGroup({
  prefix: "live",
  endpoints: {
    ticks: stream.response<{ n: number }>().get("ticks").expose(),
    chat: channel.send<{ text: string }>().response<{ text: string }>().connect("chat"),
  },
});

export const api = defineApi({
  baseURL: "http://localhost:7001",
  groups: { users, live },
});

export const caller = createCaller(api);

/* The routes a routes module would hold for the endpoints marked above. */
const endpoints = {
  "live.ticks": { transport: "sse" },
  "users.create": { type: "mutation" },
  "users.list": { type: "query" },
} as const satisfies RouteMap<typeof api>;

export const apiRoutes: CourierRoutes<typeof api, typeof endpoints> = { source: "api", endpoints };

export const browser = createProxyCaller(apiRoutes);

export const sources = { api };

// biome-ignore lint/style/noDefaultExport: a config is its module's default export, as courier.config.ts's is
export default defineConfig({ sources });
