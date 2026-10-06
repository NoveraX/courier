import { defineMockServer, defineMocks } from "@noverax/courier-mock";

import courierConfig from "./courier.config";
import type { User } from "./src/api";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The server the app calls while you work on it: Studio runs it on port 7020. */
export default defineMocks({
  shop: defineMockServer({
    source: courierConfig.sources.shop,
    port: 7020,
    autoStart: true,
    seed: { count: 12 },
    overrides: (mock, store) => {
      mock("users", "search").returns(({ variables }) => {
        const name = variables.name.toLowerCase();
        const users = store.collection<User>("users").getAll();
        return users.filter((user) => user.name.toLowerCase().includes(name));
      });
      mock("users", "slow").delay(5_000).resolves([]);
      mock("files", "upload").returns(({ variables }) => {
        const file = variables.file;
        return file instanceof File
          ? { name: file.name, type: file.type, size: file.size }
          : { name: "", type: "", size: 0 };
      });
      mock("live", "ticks").stream(async function* () {
        for (let n = 1; n <= 30; n++) {
          yield { data: { n } };
          await pause(1_000);
        }
      });
      mock("live", "chat").channel(() => ({
        onMessage(ctx, message) {
          ctx.send({ text: `Echo: ${message.text}` });
        },
      }));
    },
  }),
});
