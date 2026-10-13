/**
 * Studio as it runs tells a caller without the project's token no path of
 * the machine: its API's answers have them taken out — the server mounts
 * that for every route — and what every page is told as it happens names
 * none either. A caller with the token is told the API's paths as they are.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

let root = "";
let url = "";
let studio: StudioServer | undefined;
const sockets: Socket[] = [];

async function start(config: string): Promise<void> {
  root = mkdtempSync(join(tmpdir(), "courier-machine-paths-"));
  writeFileSync(join(root, "courier.config.ts"), config);
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await studio?.close();
  studio = undefined;
  rmSync(root, { recursive: true, force: true });
});

async function askForDocument(openapi: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: url };
  if (token !== undefined) headers[TOKEN_HEADER] = token;
  const response = await fetch(`${url}/api/openapi/document`, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "shop", openapi }),
  });
  return response.json();
}

function failedStatus(socket: Socket): Promise<{ error: { message: string } }> {
  return new Promise((resolve) => {
    socket.on("config:status", (status: { state: string; error: { message: string } }) => {
      if (status.state === "failed") resolve(status);
    });
  });
}

describe("Studio's API, as its server mounts it", () => {
  it("answers a caller without the token with no path of this machine, and one with it with the path", async () => {
    await start("export default { sources: {} };\n");
    const asked = join(realpathSync(root), "specs", "x.yaml");

    const withoutToken = await askForDocument(asked);
    const withToken = await askForDocument(asked, studio?.token);

    expect(withoutToken).toEqual({ error: "openapi is 3.1.0 or 3.2.0, not specs/x.yaml." });
    expect(withToken).toEqual({ error: `openapi is 3.1.0 or 3.2.0, not ${asked}.` });
  });
});

describe("Studio's pages", () => {
  it("are told why the config does not load with no path of this machine, a page without the token too", async () => {
    const npmrc = join(homedir(), ".npmrc");
    await start(
      `throw new Error(${JSON.stringify(`reading ${npmrc} for ${join(tmpdir(), "x", "api.ts")}`)});\n`,
    );
    const page = connect(`${url}/ui`, { transports: ["websocket"], forceNew: true, auth: {} });
    sockets.push(page);

    const { error } = await failedStatus(page);

    expect(error.message).toContain("reading ~/.npmrc for ");
    expect(error.message).toMatch(/for (<temp>|~)\/.*x\/api\.ts/);
    expect(error.message).not.toContain(homedir());
    expect(error.message).not.toContain(tmpdir());
  });
});
