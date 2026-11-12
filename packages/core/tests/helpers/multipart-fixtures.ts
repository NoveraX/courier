import { type MultipartPart, multipartParts } from "../../src/adapter/multipart/multipart-parts";

/** A part as a test compares it: its headers, and its bytes read whole. */
export interface ReadPart {
  name: string;
  filename: string | undefined;
  type: string | undefined;
  bytes: Uint8Array<ArrayBuffer>;
}

/** The parser's limits for a test that is not about them. */
export const ROOMY = { maxParts: 100_000, maxHeaderBytes: 8192 } as const;

const encoder = new TextEncoder();

/** Text as bytes. */
export const bytes = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

/** One buffer of the given pieces, text or bytes. */
export function concat(...pieces: Array<string | Uint8Array>): Uint8Array<ArrayBuffer> {
  const parts = pieces.map((piece) => (typeof piece === "string" ? bytes(piece) : piece));
  const whole = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}

/** A stream of `body` cut where `cuts` say, each a chunk of its own, counting the pulls. */
export function chunked(
  body: Uint8Array<ArrayBuffer>,
  cuts: readonly number[],
): { stream: ReadableStream<Uint8Array<ArrayBuffer>>; pulls: () => number } {
  const edges = [0, ...cuts.filter((cut) => cut > 0 && cut < body.length), body.length];
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        pulls += 1;
        const from = edges[pulls - 1];
        const to = edges[pulls];
        if (from === undefined || to === undefined) return controller.close();
        controller.enqueue(body.slice(from, to));
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls };
}

/** A stream of `body` a byte at a time. */
export function bytewise(body: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return chunked(
    body,
    Array.from({ length: body.length }, (_, at) => at),
  ).stream;
}

/**
 * The boundary a form's content type names: all that follows its `boundary=`. Read without a
 * pattern: one ending `(.+)$` reads on to the end of the text from each `boundary=` it holds,
 * in time that grows with the square of its length.
 */
export function boundaryIn(contentType: string): string | undefined {
  const at = contentType.indexOf("boundary=");
  const boundary = at === -1 ? "" : contentType.slice(at + "boundary=".length);
  return boundary === "" ? undefined : boundary;
}

/** Read every part of a body, each one whole. */
export async function readParts(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  boundary: string,
  limits: { maxParts: number; maxHeaderBytes: number } = ROOMY,
): Promise<ReadPart[]> {
  const read: ReadPart[] = [];
  for await (const part of multipartParts(stream, boundary, limits)) read.push(await whole(part));
  return read;
}

async function whole(part: MultipartPart): Promise<ReadPart> {
  const pieces: Uint8Array[] = [];
  for await (const piece of part.body) pieces.push(piece);
  return { name: part.name, filename: part.filename, type: part.type, bytes: concat(...pieces) };
}
