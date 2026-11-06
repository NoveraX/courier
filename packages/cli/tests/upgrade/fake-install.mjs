/**
 * An install for the tests, run as `node fake-install.mjs <ok|fail>` in
 * the workspace's folder, as `npm install` runs there: `ok` writes the
 * lockfile of what package.json lists and ends well; `fail` writes it,
 * then ends with status 1, as an install that stops part way.
 */
import { readFileSync, writeFileSync } from "node:fs";

const listed = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync("package-lock.json", `${JSON.stringify({ lockfileVersion: 3, listed }, null, 2)}\n`);
if (process.argv[2] === "fail") process.exitCode = 1;
