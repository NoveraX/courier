import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { stream, channel } = courier();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A live API served for real by `startCourierServer`: a finite stream, one
 * that never ends, and a chat channel that echoes each message with its room.
 */
export const liveApi = defineApi({
  name: "api",
  baseURL: "http://upstream.invalid",
  groups: {
    live: defineGroup({
      prefix: "live",
      endpoints: {
        ticks: stream
          .variables<{ n: number; from?: number }>()
          .response<{ i: number }>()
          .implement(async function* (ctx) {
            const from = ctx.variables.from ?? 1;
            for (let i = from; i < from + ctx.variables.n; i++) {
              await sleep(20);
              yield { data: { i } };
            }
          }),
        room: channel
          .variables<{ room: string }>()
          .send<{ text: string }>()
          .response<{ echo: string; room: string }>()
          .implement((variables) => ({
            onMessage(ctx, message) {
              ctx.send({ echo: message.text, room: variables.room });
            },
          })),
      },
    }),
  },
});
