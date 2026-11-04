import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { startProductionSite } from "./production-site"
import { SITE_HOST, STAND } from "./stand"

/* A key and a certificate for the site's name, made for this run alone and trusted by nothing but
   the browsers it starts, which are told to take any certificate. */
function certificateIn(dir: string): { keyPath: string; certPath: string } {
  const keyPath = join(dir, "key.pem")
  const certPath = join(dir, "cert.pem")
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${SITE_HOST}`,
      "-addext",
      `subjectAltName=DNS:${SITE_HOST}`,
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ],
    { stdio: "pipe" }
  )
  return { keyPath, certPath }
}

/**
 * Before the examples run: start the site's production server and make
 * the certificate its front serves, unless `SITE_URL` names a deployed
 * site to run them against instead.
 *
 * @returns What stops the server and removes the certificate
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if (process.env.SITE_URL) return async () => {}
  const dir = mkdtempSync(join(tmpdir(), "courier-site-examples-"))
  const { keyPath, certPath } = certificateIn(dir)
  const site = await startProductionSite()
  /* The workers start after this, from this process's environment. */
  process.env[STAND.site] = site.origin
  process.env[STAND.key] = keyPath
  process.env[STAND.cert] = certPath
  return async () => {
    await site.stop()
    rmSync(dir, { recursive: true, force: true })
  }
}
