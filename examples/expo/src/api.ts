import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint, stream, channel } = courier();

const User = z.object({ id: z.number(), name: z.string(), email: z.string() });
const Stored = z.object({ name: z.string(), type: z.string(), size: z.number() });
const Message = z.object({ text: z.string() });

/** A user of the shop. */
export type User = z.infer<typeof User>;

/**
 * The shop the example calls: the app with its own server's address, the
 * mock with any, since only the paths matter to it.
 *
 * @param baseURL - Where the API is served
 * @returns The API
 */
export function shopApi(baseURL: string) {
  return defineApi({
    name: "shop",
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          list: endpoint.get("").response(z.array(User)),
          search: endpoint
            .query("search")
            .variables(z.object({ name: z.string() }))
            .response(z.array(User)),
          slow: endpoint.get("slow").response(z.array(User)),
        },
      }),
      files: defineGroup({
        prefix: "files",
        endpoints: { upload: endpoint.post("").variables<FormData>().response(Stored) },
      }),
      live: defineGroup({
        prefix: "live",
        endpoints: {
          ticks: stream.response(z.object({ n: z.number() })).get("ticks"),
          chat: channel.send(Message).response(Message).connect("chat"),
        },
      }),
    },
  });
}

/** The shop's API, as its clients are typed from it. */
export type ShopApi = ReturnType<typeof shopApi>;
