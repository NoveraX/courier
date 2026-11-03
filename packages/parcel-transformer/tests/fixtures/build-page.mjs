/* Build index.html of the folder this runs in with Parcel, as `parcel build` does from an
   app's own folder, and print the script it built, or why it built none. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Parcel } from "@parcel/core";

const root = process.cwd();

try {
  const parcel = new Parcel({
    entries: join(root, "index.html"),
    config: join(root, ".parcelrc"),
    cacheDir: join(root, ".parcel-cache"),
    mode: "production",
    defaultTargetOptions: { distDir: join(root, "dist"), shouldOptimize: false },
    shouldPatchConsole: false,
    logLevel: "error",
  });
  const { bundleGraph } = await parcel.run();
  const script = bundleGraph.getBundles().find((bundle) => bundle.type === "js");
  process.stdout.write(script === undefined ? "" : readFileSync(script.filePath, "utf8"));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
