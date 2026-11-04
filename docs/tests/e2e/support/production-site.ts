import { type ChildProcess, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer } from "node:net"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** The site's production server, as its container runs it. */
export interface ProductionSite {
  /** Where Next's server listens, on this machine alone. */
  readonly origin: string
  /** What both servers printed. */
  output(): string
  stop(): Promise<void>
}

const STANDALONE = fileURLToPath(new URL("../../../.next/standalone/", import.meta.url))

/* Ports for Next's server and the backend: Next's standalone server reads PORT=0 as 3000, so a
   port is found free first, as e2e/support/free-port.ts finds Studio's. */
function freePorts(count: number): Promise<number[]> {
  const servers = Array.from({ length: count }, () => createServer())
  return Promise.all(
    servers.map(
      (server) =>
        new Promise<number>((resolve, reject) => {
          server.once("error", reject)
          server.listen(0, "127.0.0.1", () => {
            const address = server.address()
            resolve(typeof address === "object" && address !== null ? address.port : 0)
          })
        })
    )
  ).finally(() => {
    for (const server of servers) server.close()
  })
}

async function answersOk(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    /* Not listening yet: the probe asks again. */
    return false
  }
}

/* Ready as its container's health check says it is: both servers answer their health probes. */
async function readyOf(
  child: ChildProcess,
  probes: readonly string[],
  output: () => string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The site exited before it was ready:\n${output()}`)
    }
    if ((await Promise.all(probes.map(answersOk))).every(Boolean)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`The site was not ready in ${timeoutMs} ms:\n${output()}`)
}

/**
 * Start the site's production build — what `npm run build` put together in
 * `.next/standalone` — with its launcher, as the container does: Next's
 * server and the examples' backend, each on this machine alone.
 *
 * @returns The running site
 * @throws When there is no production build, or the site does not get ready
 * @example
 * ```ts
 * const site = await startProductionSite()
 * await site.stop()
 * ```
 */
export async function startProductionSite(): Promise<ProductionSite> {
  if (!existsSync(join(STANDALONE, "launch.mjs"))) {
    throw new Error("The site has no production build here: run `npm run build` first")
  }
  const [nextPort, apiPort] = await freePorts(2)
  const child = spawn(process.execPath, ["launch.mjs"], {
    cwd: STANDALONE,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(nextPort),
      HOSTNAME: "127.0.0.1",
      API_URL: `http://127.0.0.1:${apiPort}`,
      EXPRESS_HOST: "127.0.0.1",
      EXPRESS_PORT: String(apiPort),
    },
  })
  let printed = ""
  const record = (chunk: Buffer) => {
    printed += chunk.toString()
  }
  child.stdout?.on("data", record)
  child.stderr?.on("data", record)
  const output = () => printed
  const origin = `http://127.0.0.1:${nextPort}`
  await readyOf(
    child,
    [`${origin}/api/health`, `http://127.0.0.1:${apiPort}/health`],
    output,
    60_000
  )

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
    child.kill("SIGTERM")
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000)
    await exited
    clearTimeout(timer)
  }
  return { origin, output, stop }
}
