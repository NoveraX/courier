import { createLogger } from "@noverax/nexus";

const MIN_MAJOR = 22;

export function checkNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < MIN_MAJOR) {
    const log = createLogger("Studio");
    log.error(`Node.js >= ${MIN_MAJOR} required. Current: ${process.versions.node}`);
    process.exit(1);
  }
}
