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

  const ticks = caller.live.ticks();
  const seen: number[] = [];
  for await (const event of ticks) {
    seen.push(event.data.n);
    if (seen.length === 3) break;
  }
  ticks.close();
  console.log("Ticks the upstream streamed, through the proxy:", seen);

  const chat = caller.live.chat();
  const heard = new Promise<string[]>((resolve) => {
    const lines: string[] = [];
    chat.on("data", (message) => {
      lines.push(`${message.from}: ${message.text}`);
      if (lines.length === 2) resolve(lines);
    });
  });
  chat.send({ text: "Hello from the demo" });
  console.log("The chat the server keeps:", await heard);
  chat.close();
} finally {
  await proxy.stop();
  upstream.close();
}
