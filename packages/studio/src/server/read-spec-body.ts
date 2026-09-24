import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { SpecFetchError } from "./spec-fetch-error";

/* Far past the largest public specification seen (Stripe's is 8 MB). */
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Read a specification's body as text: decompressed as the server encoded
 * it, at most 64 MB once decompressed — so a small compressed body cannot
 * unfold into an unbounded one — and without a leading byte-order mark,
 * which JSON parsers refuse.
 *
 * @param response - The server's answer, status already checked
 * @param url - What was fetched, for messages
 * @returns The body as text
 * @throws {SpecFetchError} `SPEC_TOO_LARGE`, or `SPEC_UNREACHABLE` for an encoding Studio cannot read
 *
 * @example
 * ```ts
 * const text = await readSpecBody(response, url);
 * ```
 */
export async function readSpecBody(response: IncomingMessage, url: URL): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of decoded(response, url)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAX_BYTES) {
      response.destroy();
      throw new SpecFetchError(
        "SPEC_TOO_LARGE",
        `${url.href} is larger than ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.startsWith("﻿") ? text.slice(1) : text;
}

function decoded(response: IncomingMessage, url: URL): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "identity")
    .trim()
    .toLowerCase();
  if (encoding === "identity" || encoding === "") return response;
  if (encoding === "gzip" || encoding === "x-gzip") return response.pipe(createGunzip());
  if (encoding === "deflate") return response.pipe(createInflate());
  if (encoding === "br") return response.pipe(createBrotliDecompress());
  response.destroy();
  throw new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${url.href} answered in the encoding "${encoding}", which Studio cannot read.`,
  );
}
