/**
 * Load each module named after the script with the runtime's Web Streams
 * taken away, as React Native has none, and print the ones that failed.
 */
import { argv, stdout } from "node:process";

for (const name of ["ReadableStream", "WritableStream", "TransformStream"]) {
  Reflect.deleteProperty(globalThis, name);
}

const failed: string[] = [];
for (const entry of argv.slice(2)) {
  try {
    await import(entry);
  } catch (error) {
    failed.push(`${entry}: ${String(error)}`);
  }
}
stdout.write(JSON.stringify(failed));
