import type { IncomingMessage } from "node:http";

/**
 * The body of a Node request as a Web stream that reads only on demand.
 *
 * `Readable.toWeb` starts reading the moment it is called, and a request that
 * is being read is one Node no longer discards for itself once the response
 * ends. A handler that answered without looking at the body — a refusal, most
 * often — left it on the connection. A browser reads a response only once its
 * upload is done or the connection closes, so it waited on its own upload
 * until the keep-alive timer closed the socket: 6 s on Express, 73 s on
 * Fastify. Read lazily, a body nobody touched is still Node's to discard.
 *
 * Cancelling the stream discards the rest in the same way. Destroying the
 * request instead, as `Readable.toWeb` does, destroys the socket, and the
 * answer the handler is about to write goes with it.
 *
 * @param nodeReq - The incoming request, its body not yet read
 * @returns The body, read from the connection as the stream is pulled
 *
 * @example
 * ```ts
 * new Request(url, { method: "POST", body: nodeRequestBody(req), duplex: "half" });
 * ```
 */
export function nodeRequestBody(nodeReq: IncomingMessage): ReadableStream<Uint8Array> {
  let detach: (() => void) | undefined;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        detach ??= feed(nodeReq, controller);
        nodeReq.resume();
      },
      cancel() {
        detach?.();
        nodeReq.resume();
      },
    },
    /* Nothing is read ahead of a reader: a pull at construction would mark the
       request as consumed before anyone asked for it. */
    { highWaterMark: 0 },
  );
}

/**
 * Move the request's chunks into the stream, one read at a time.
 *
 * @returns A function that stops listening, leaving the request as it is
 */
function feed(
  nodeReq: IncomingMessage,
  controller: ReadableStreamDefaultController<Uint8Array>,
): () => void {
  const onData = (chunk: Uint8Array) => {
    controller.enqueue(chunk);
    if ((controller.desiredSize ?? 0) <= 0) nodeReq.pause();
  };
  const onEnd = () => {
    stop();
    controller.close();
  };
  const onError = (error: Error) => {
    stop();
    controller.error(error);
  };
  const onClose = () => {
    if (nodeReq.readableEnded) return;
    onError(new Error("The client closed the connection before its request body was complete"));
  };
  function stop(): void {
    nodeReq.off("data", onData);
    nodeReq.off("end", onEnd);
    nodeReq.off("error", onError);
    nodeReq.off("close", onClose);
  }

  nodeReq.on("data", onData);
  nodeReq.once("end", onEnd);
  nodeReq.once("error", onError);
  nodeReq.once("close", onClose);
  return stop;
}
