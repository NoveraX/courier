/**
 * The Courier server the React Native tests drive in a process of its own
 * (`helpers/app-server.ts`): once that process has ended, as it ends when a
 * command fails there, what the test asks of it is refused with how it
 * ended and what it wrote to stderr, rather than left waiting for an
 * answer that never comes.
 */
import { describe, expect, it } from "vitest";

import { serveApp } from "./helpers/app-server";

describe("a server in a process of its own, for an app's tests", () => {
  it("refuses a command once its process has ended, saying how it ended", async () => {
    const server = await serveApp();
    await server.stop();

    await expect(server.broadcast("late")).rejects.toThrow("The server exited with 0");
    await expect(server.stats()).rejects.toThrow("The server exited with 0");
  });
});
