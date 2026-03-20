import { createGetHandler } from "./adapter/handle-get";
import { createPostHandler } from "./adapter/handle-post";
import { errorResponse } from "./adapter/parse";
import type { Sources } from "./define/types";
import { devtoolsHooks } from "./devtools";
import { executeRequest } from "./utils/execute";
import type { RequestPayloadInput } from "./utils/helpers";

export type AdapterHandler = {
  /** Handle any HTTP method (auto-routes GET/POST, returns 405 for others) */
  handle: (request: Request) => Promise<Response>;
  /** Handle GET request (query endpoints only) */
  handleGet: (request: Request) => Promise<Response>;
  /** Handle POST request (mutations + data) */
  handlePost: (request: Request) => Promise<Response>;
};

export function createHandler(sources: Sources): AdapterHandler {
  const execute = (
    request: Request,
    payload: RequestPayloadInput,
    proxyMethod: "GET" | "POST",
    proxyReceiveAt: number,
  ) =>
    executeRequest(sources, payload, {
      req: request,
      res: new Response(),
      proxyMethod,
      mode: "proxy",
      proxyReceiveAt,
    });

  const dt = devtoolsHooks;
  const handleGet = createGetHandler(execute, dt);
  const handlePost = createPostHandler(execute, dt);

  const handle = async (request: Request): Promise<Response> => {
    if (request.method === "GET") return handleGet(request);
    if (request.method === "POST") return handlePost(request);
    return errorResponse(405, "Method not allowed");
  };

  return { handle, handleGet, handlePost };
}
