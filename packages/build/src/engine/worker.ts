/* The process the engine starts to read a project's routes once: it takes the
   request, answers with the routes or why there are none, and ends, whatever
   timers or sockets the config left open. The config runs here, never in the
   bundler's own process, so each reading sees the files as they are now. */
import { readProjectRoutes } from "./read-project-routes";
import { RoutesReadError } from "./routes-read-error";
import type { RoutesRequest } from "./routes-snapshot";
import type { WorkerReply } from "./worker-reply";

process.once("message", (request: RoutesRequest) => {
  void answer(request);
});

async function answer(request: RoutesRequest): Promise<void> {
  const reply = await readProjectRoutes(request).then(
    (snapshot): WorkerReply => ({ ok: true, snapshot }),
    (error: unknown): WorkerReply => failure(error, request),
  );
  process.send?.(reply, () => process.exit(0));
}

function failure(error: unknown, request: RoutesRequest): WorkerReply {
  if (error instanceof RoutesReadError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      context: error.context,
      stack: error.stack,
    };
  }
  return {
    ok: false,
    code: "CONFIG_NOT_LOADED",
    message: `The routes a page takes were not read: ${error instanceof Error ? error.message : String(error)}`,
    context: { root: request.root, configFile: request.configFile },
    stack: error instanceof Error ? error.stack : undefined,
  };
}
