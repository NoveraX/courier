/* The process the engine starts to read a project's routes once: it takes the
   request, answers with the routes or why there are none, and ends, whatever
   timers or sockets the config left open, or as soon as the engine is gone.
   The config runs here, never in the bundler's own process, so each reading
   sees the files as they are now. */
import { readProjectRoutes } from "./read-project-routes";
import { RoutesReadError } from "./routes-read-error";
import type { RoutesRequest } from "./routes-snapshot";
import { workerMessages } from "./worker-messages";
import type { WorkerReply } from "./worker-reply";

process.on("message", take);
/* The engine is gone, and no one is left to take the answer: running on would outlive it. */
process.once("disconnect", () => process.exit(1));

/* The engine's request, apart from any message a config sends on the channel. */
function take(message: unknown): void {
  if (!workerMessages.isRequest(message)) return;
  process.off("message", take);
  void answer(message.request);
}

async function answer(request: RoutesRequest): Promise<void> {
  const reply = await readProjectRoutes(request).then(
    (snapshot): WorkerReply => ({ ok: true, snapshot }),
    (error: unknown): WorkerReply => failure(error, request),
  );
  process.send?.(workerMessages.reply(reply), () => process.exit(0));
}

function failure(error: unknown, request: RoutesRequest): WorkerReply {
  if (error instanceof RoutesReadError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      context: error.context,
      stack: error.stack,
      inputs: error.inputs,
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
