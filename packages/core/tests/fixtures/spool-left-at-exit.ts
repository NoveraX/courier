/**
 * A process that writes an upload's file to disk and exits before letting
 * it go, as one stopped mid-call does. Its folder is given on the command
 * line; it prints how many folders were there before it exited.
 */
import { readdirSync } from "node:fs";

import { diskStore } from "../../src/adapter/multipart/disk-store";
import { nodeDisk } from "../../src/adapter/multipart/node-disk";

const directory = process.argv[2] ?? "";
const disk = nodeDisk();
if (disk === undefined) throw new Error("this runtime has no disk for uploads");

const store = diskStore({ disk, directory, memoryBytes: 0, slabBytes: 16 });
const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
  start(controller) {
    controller.enqueue(new Uint8Array(100));
    controller.close();
  },
});
await store.file({ name: "f", filename: "a.bin", type: undefined, body });

process.stdout.write(String(readdirSync(directory).length));
process.exit(0);
