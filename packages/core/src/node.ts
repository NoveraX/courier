import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

/**
 * Convert a Node.js IncomingMessage to a Web Standard Request.
 * Works with Express, Fastify, NestJS, and any Node.js HTTP framework.
 */
export function toWebRequest(nodeReq: IncomingMessage): Request {
  const encrypted = "encrypted" in nodeReq.socket && nodeReq.socket.encrypted;
  const protocol = encrypted ? "https" : "http";
  const host = nodeReq.headers.host ?? "localhost";
  const url = new URL(nodeReq.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeReq.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const init: RequestInit & { duplex?: string } = { method: nodeReq.method, headers };

  if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
    init.body = Readable.toWeb(nodeReq) as ReadableStream;
    init.duplex = "half";
  }

  return new Request(url, init);
}

/**
 * Send a Web Standard Response to a Node.js ServerResponse.
 * Handles streaming bodies and set-cookie headers.
 */
export async function sendWebResponse(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  const headersObj: Record<string, string | string[]> = {};
  for (const [key, value] of webRes.headers.entries()) {
    if (key === "set-cookie") {
      headersObj[key] = webRes.headers.getSetCookie();
    } else {
      headersObj[key] = value;
    }
  }

  nodeRes.writeHead(webRes.status, headersObj);

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  const reader = webRes.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      nodeRes.write(value);
    }
  } finally {
    reader.releaseLock();
    nodeRes.end();
  }
}
