import { apiRoute, sseRoute } from "../../lib/index.js";

const { GET } = apiRoute();
const stream = sseRoute();

/* A number is not a NextRequest. Each line compiles only while the request
   type resolves; were it lost, the directive would be unused and fail. */
// @ts-expect-error — the route's request type is NextRequest
export const routeRequest: Parameters<typeof GET>[0] = 42;
// @ts-expect-error — the stream route's request type is NextRequest
export const streamRequest: Parameters<typeof stream.GET>[0] = 42;
