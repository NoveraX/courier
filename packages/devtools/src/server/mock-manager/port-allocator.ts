import { createServer } from "node:net";

/** Check if a port is available on localhost */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** Find the next available port starting from `preferred` */
export async function allocatePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 100; port++) {
    if (await isPortAvailable(port)) return port;
  }
  return 0;
}
