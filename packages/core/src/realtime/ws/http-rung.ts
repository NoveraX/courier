/**
 * What the transport ladder loads once a connection goes on over HTTP, and
 * a page whose WebSocket works never loads: the socket over HTTP, and the
 * watch for a WebSocket getting through again.
 */
export { createHTTPSocket } from "../ws-http/http-socket";
export { watchForWebSocket } from "./websocket-probe";
