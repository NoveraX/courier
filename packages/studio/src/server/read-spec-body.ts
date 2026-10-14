import type { IncomingMessage } from "node:http";
import { finished, type Readable, type Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { errnoCode, messageOf } from "@noverax/courier-cli/devkit";
import type { Capacity } from "./capacity";
import { SpecFetchError } from "./spec-fetch-error";
import { StudioBusyError } from "./studio-busy-error";

/** The most a specification's text may be: far past the largest public one seen (Stripe's is 8 MB). */
export const SPEC_MAX_BYTES = 64 * 1024 * 1024;

/** The most a public demo's visitor may have Studio read from a URL: what the demo takes pasted in. */
export const PUBLIC_SPEC_MAX_BYTES = 16 * 1024 * 1024;

const DECODERS: ReadonlyMap<string, () => Transform> = new Map([
  ["gzip", createGunzip],
  ["x-gzip", createGunzip],
  ["deflate", createInflate],
  ["br", createBrotliDecompress],
]);

/* What a response fails with when its connection closes before the body is
   complete; Windows names a connection it aborted ECONNABORTED. */
const CUT_OFF: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
]);

/**
 * Read a specification's body as text: decompressed as the server encoded
 * it, at most 64 MB once decompressed, or the limit given — so a small
 * compressed body cannot unfold into an unbounded one — and without a
 * leading byte-order mark, which JSON parsers refuse.
 *
 * The response and its decompressor fail together: a connection that closes
 * partway fails the read at once, whatever the encoding, rather than leave
 * it waiting for data that will not come.
 *
 * A budget shared with other reads holds what they buffer together: each
 * chunk is taken from it as it arrives and the whole body given back once
 * read, so stalled answers cannot pile up more than the budget between them.
 *
 * @param response - The server's answer, status already checked
 * @param url - What was fetched, for messages
 * @param maxBytes - The most the text may be, decompressed
 * @param budget - The bytes this read shares with others, when it does
 * @returns The body as text
 * @throws {SpecFetchError} `SPEC_TOO_LARGE`, or `SPEC_UNREACHABLE` for a body cut off, one that does not decompress, or an encoding Studio cannot read
 * @throws {StudioBusyError} When the reads sharing the budget hold all of it
 *
 * @example
 * ```ts
 * const text = await readSpecBody(response, url);
 * ```
 */
export async function readSpecBody(
  response: IncomingMessage,
  url: URL,
  maxBytes: number = SPEC_MAX_BYTES,
  budget?: Capacity,
): Promise<string> {
  const encoding = contentEncoding(response);
  const held = { bytes: 0 };
  try {
    const chunks = await collect(decoded(response, encoding, url), url, maxBytes, budget, held);
    const text = Buffer.concat(chunks).toString("utf8");
    return text.startsWith("﻿") ? text.slice(1) : text;
  } catch (cause) {
    /* Whatever failed, the connection is not left open behind it. */
    response.destroy();
    throw bodyFailure(url, encoding, cause);
  } finally {
    budget?.give(held.bytes);
  }
}

/* Every chunk of the body, until together they pass the limit or the shared budget. */
async function collect(
  body: Readable,
  url: URL,
  maxBytes: number,
  budget: Capacity | undefined,
  held: { bytes: number },
): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  const read: AsyncIterable<unknown> = body;
  for await (const chunk of read) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (held.bytes + bytes.length > maxBytes) {
      throw new SpecFetchError(
        "SPEC_TOO_LARGE",
        `${url.href} is larger than ${maxBytes / 1024 / 1024} MB.`,
      );
    }
    if (budget !== undefined && !budget.take(bytes.length)) throw new StudioBusyError(FULL);
    held.bytes += bytes.length;
    chunks.push(bytes);
  }
  return chunks;
}

const FULL =
  "Studio holds as much of the specifications it reads for pages without the project's token as it takes at once. Try again in a moment.";

function contentEncoding(response: IncomingMessage): string {
  return String(response.headers["content-encoding"] ?? "identity")
    .trim()
    .toLowerCase();
}

/* pipe() does not pass a failure of the response on to the decoder, which
   would then wait for good for the rest of a body cut off; `finished` passes
   it on. `pipeline` would not do: it destroys a response by aborting its
   request, which does nothing once the connection has closed, and then waits
   on that response for good. */
function decoded(response: IncomingMessage, encoding: string, url: URL): Readable {
  if (encoding === "identity" || encoding === "") return response;
  const decoder = DECODERS.get(encoding);
  if (decoder === undefined) {
    throw new SpecFetchError(
      "SPEC_UNREACHABLE",
      `${url.href} answered in the encoding "${encoding}", which Studio cannot read.`,
    );
  }
  const decoding = response.pipe(decoder());
  finished(response, (error) => {
    if (error) decoding.destroy(error);
  });
  return decoding;
}

/* The host answered either way: its connection closed partway, or it sent a
   body its own encoding does not describe. A body read as it came can only
   have been cut off. */
function bodyFailure(url: URL, encoding: string, cause: unknown): Error {
  if (cause instanceof SpecFetchError || cause instanceof StudioBusyError) return cause;
  const code = errnoCode(cause);
  if (!DECODERS.has(encoding) || (code !== undefined && CUT_OFF.has(code))) {
    return SpecFetchError.cutOff(url, cause);
  }
  return new SpecFetchError(
    "SPEC_UNREACHABLE",
    `${url.href} sent a ${encoding} body that does not decompress (${messageOf(cause)}).`,
    { cause, url: url.href },
  );
}
