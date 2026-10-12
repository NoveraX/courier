/**
 * The site's container: the Next.js server and, beside it, the Express
 * backend the live examples call. When either stops, the other is stopped
 * and the container ends, so whatever runs it starts it again; a signal the
 * container is sent reaches both.
 */
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const at = (path) => fileURLToPath(new URL(path, import.meta.url))

const children = [
  spawn(process.execPath, [at("./backend.cjs")], { stdio: "inherit" }),
  spawn(process.execPath, [at("./docs/server.js")], { stdio: "inherit" }),
]

let ending = false

function end(code) {
  if (ending) return
  ending = true
  process.exitCode = code
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM")
}

for (const child of children) {
  child.on("exit", (code, signal) => end(code ?? (signal === "SIGTERM" ? 0 : 1)))
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => end(0))
