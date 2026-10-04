import { caller } from "./client";
import { serverCaller } from "./direct";
import { startProxy } from "./server";
import { startUpstream } from "./upstream";

const upstream = await startUpstream();
const proxy = await startProxy();

try {
  const everyone = await serverCaller.users.getAll();
  console.log("Server code, straight to the upstream:", everyone);

  const ada = await caller.users.getById({ id: "1" });
  console.log("A page, through the proxy:", ada);

  const grace = await caller.users.create({ name: "Grace Hopper", email: "grace@example.com" });
  console.log("Created through the proxy:", grace);
} finally {
  await proxy.stop();
  upstream.close();
}
