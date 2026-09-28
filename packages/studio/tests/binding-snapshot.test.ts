/**
 * How many runtimes and sources Studio says are connected.
 *
 * The counts were taken from the binding rows alone, and a row exists only
 * for a source whose `defineApi` declares a `proxyPath` — which no README
 * setup does. With a server and a browser attached and requests streaming
 * in, the status bar read "0 runtimes · 0 sources" and the Playground said
 * "No app connected".
 *
 * A real Studio server runs a README-style project here, and this process
 * attaches to it as the application's server does.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { announceHosting } from "@noverax/courier-studio-core/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { BindingSnapshotPayload } from "../src/server/binding-snapshot";
import { type LiveApp, startLiveApp } from "./helpers/live-app";
import { type LiveStudio, startLiveStudio, until } from "./helpers/live-studio";

const CONFIG = `
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
const { endpoint } = courier();
const users = defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } });
export default { sources: { api: defineApi({ baseURL: "http://127.0.0.1:9", groups: { users } }) } };
`;

let studio: LiveStudio;
let app: LiveApp | undefined;
let registered: ReturnType<typeof sources>;
const snapshots: BindingSnapshotPayload[] = [];

function sources() {
  const { endpoint } = courier();
  const users = defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } });
  return { api: defineApi({ baseURL: "http://127.0.0.1:9", groups: { users } }) };
}

beforeAll(async () => {
  studio = await startLiveStudio({ "courier.config.ts": CONFIG });
  studio.ui.on("binding:snapshot", (snapshot: BindingSnapshotPayload) => snapshots.push(snapshot));
}, 30_000);

afterAll(async () => {
  await app?.close();
  await studio.close();
});

describe("the counts Studio sends with each binding snapshot", () => {
  it("count a runtime as soon as it attaches", async () => {
    registered = sources();
    app = await startLiveApp(studio.url, "app", registered);
    await until(() => snapshots.some((s) => s.runtimeCount === 1), "a runtime to be counted");

    expect(snapshots.at(-1)).toMatchObject({ runtimeCount: 1, sourceCount: 0 });
  });

  it("count the sources a runtime serves once it says so", async () => {
    announceHosting({ transports: ["http"], sources: Object.values(registered) });
    await until(() => snapshots.some((s) => s.sourceCount === 1), "the source to be counted");

    expect(snapshots.at(-1)).toMatchObject({ runtimeCount: 1, sourceCount: 1 });
  });

  it("stop counting a runtime once it detaches", async () => {
    await app?.close();
    app = undefined;
    await until(() => snapshots.at(-1)?.runtimeCount === 0, "the runtime to be gone");

    expect(snapshots.at(-1)).toMatchObject({ runtimeCount: 0, sourceCount: 0 });
  });
});
