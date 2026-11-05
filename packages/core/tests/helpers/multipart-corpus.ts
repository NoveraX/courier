import { parseMultipart } from "@remix-run/multipart-parser";

import { encodeMultipart } from "../../src/utils/multipart-body";
import { concat, type ReadPart } from "./multipart-fixtures";

/** A form a test builds, and the bytes each encoder writes for it. */
export interface Encoded {
  form: FormData;
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
}

const NAMES = [
  "a",
  "file",
  "émoji 🙂",
  'quote"d',
  "line\r\nbreak",
  "100%22",
  "",
  "_options",
  "a;b",
];
/* No text opens with a byte order mark: undici before 7, Node 22's, drops one the standard
   keeps, as the parser does (read-form.test.ts holds it to that). */
const TEXTS = [
  "",
  "plain",
  "two\r\nlines",
  "bare\nfeed",
  "\u{1F600} wide",
  "--",
  "\r\n--x",
  "mid\uFEFFbom",
];
const FILENAMES = ["a.bin", "résumé.pdf", 'q"uote.txt', "", "dir\\file.txt", "semi;colon"];
const TYPES = ["application/octet-stream", "image/png", "text/plain;charset=utf-8", ""];

/** Random bytes that lean towards the ones a multipart parser has to tell apart: CR, LF, `-`. */
export function trickyBytes(random: () => number, length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  for (let at = 0; at < length; at++) {
    const roll = random();
    out[at] = roll < 0.15 ? 13 : roll < 0.3 ? 10 : roll < 0.45 ? 45 : Math.floor(random() * 256);
  }
  return out;
}

const pick = <T>(random: () => number, from: readonly T[]): T =>
  from[Math.floor(random() * from.length)] as T;

/** A random form of fields and files. */
export function randomForm(random: () => number): FormData {
  const form = new FormData();
  const count = 1 + Math.floor(random() * 10);
  for (let at = 0; at < count; at++) {
    const name = pick(random, NAMES);
    if (random() < 0.5) {
      form.append(name, pick(random, TEXTS));
    } else {
      const data = trickyBytes(random, Math.floor(random() * 3000));
      form.append(name, new File([data], pick(random, FILENAMES), { type: pick(random, TYPES) }));
    }
  }
  return form;
}

/** The form as the platform's own encoder writes it. */
export async function encodedByPlatform(form: FormData): Promise<Encoded> {
  const response = new Response(form);
  const body = new Uint8Array(await response.arrayBuffer());
  return { form, body, contentType: response.headers.get("content-type") ?? "" };
}

/** The form as Courier's encoder writes it. */
export async function encodedByCourier(form: FormData): Promise<Encoded> {
  const { blob, contentType } = encodeMultipart(form);
  return { form, body: new Uint8Array(await blob.arrayBuffer()), contentType };
}

/** A form's entries as a test compares them. */
export type Entry = [
  name: string,
  value: string | { filename: string; type: string; bytes: string },
];

/* Bytes as a string of one character each, which a deep comparison takes in one step. */
export const latin1 = (data: Uint8Array): string => Buffer.from(data).toString("latin1");

/** The entries the platform's own parser reads from a body. */
export async function platformEntries(
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<Entry[]> {
  const form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  const entries: Entry[] = [];
  for (const [name, value] of form) {
    entries.push(
      typeof value === "string"
        ? [name, value]
        : [
            name,
            {
              filename: value.name,
              type: value.type,
              bytes: latin1(new Uint8Array(await value.arrayBuffer())),
            },
          ],
    );
  }
  return entries;
}

/**
 * The parts @remix-run/multipart-parser reads from a body, as Courier's
 * parser hands them out: each part's name, filename, `Content-Type` as sent
 * and bytes. It throws for a body it does not read.
 */
export function remixParts(body: Uint8Array<ArrayBuffer>, boundary: string): ReadPart[] {
  return [...parseMultipart(body, { boundary })].map((part) => ({
    name: part.name ?? "",
    filename: part.filename,
    type: part.headers["content-type"],
    bytes: new Uint8Array(part.bytes),
  }));
}

/* The platform's reading of a part: a field as UTF-8 with its byte order mark kept, a file's
   missing type as text/plain. */
const fieldText = new TextDecoder("utf-8", { ignoreBOM: true });

/** The parser's parts as the platform would hand them out. */
export function asEntries(parts: ReadPart[]): Entry[] {
  return parts.map((part) => {
    if (part.filename === undefined) return [part.name, fieldText.decode(part.bytes)];
    /* A File's type is lower-cased, and emptied when it holds a character outside U+0020–U+007E. */
    const type = new File([], "", { type: part.type ?? "text/plain" }).type;
    return [part.name, { filename: part.filename, type, bytes: latin1(part.bytes) }];
  });
}

/** Cut points for `length` bytes: none, a few at random, or many small ones. */
export function randomCuts(random: () => number, length: number): number[] {
  const roll = random();
  if (roll < 0.2) return [];
  const step = roll < 0.6 ? 1 + Math.floor(random() * 97) : 1 + Math.floor(random() * 4096);
  const cuts: number[] = [];
  for (let at = step; at < length; at += 1 + Math.floor(random() * step * 2)) cuts.push(at);
  return cuts;
}

/** The body with a few random changes of the kinds that break a multipart body. */
export function mutated(
  random: () => number,
  body: Uint8Array<ArrayBuffer>,
  boundary: string,
): Uint8Array<ArrayBuffer> {
  let out = body;
  const count = 1 + Math.floor(random() * 3);
  for (let change = 0; change < count; change++) {
    const at = Math.floor(random() * (out.length + 1));
    const roll = random();
    if (roll < 0.2)
      out = concat(
        out.subarray(0, at),
        out.subarray(Math.min(out.length, at + 1 + Math.floor(random() * 40))),
      );
    else if (roll < 0.4)
      out = concat(
        out.subarray(0, at),
        pick(random, [
          "\r\n",
          "\n",
          "\r",
          "--",
          `\r\n--${boundary}`,
          `--${boundary}--`,
          ": ",
          '"',
          " ",
        ]),
        out.subarray(at),
      );
    else if (roll < 0.6) out = out.subarray(0, at);
    else if (roll < 0.8) {
      out = out.slice();
      if (at < out.length) out[at] = Math.floor(random() * 256);
    } else {
      const crlf = findFrom(out, [13, 10], at);
      if (crlf !== -1) out = concat(out.subarray(0, crlf), out.subarray(crlf + 1));
    }
  }
  return out;
}

function findFrom(haystack: Uint8Array, needle: number[], from: number): number {
  for (let at = from; at + needle.length <= haystack.length; at++) {
    if (needle.every((byte, offset) => haystack[at + offset] === byte)) return at;
  }
  return -1;
}
