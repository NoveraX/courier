/**
 * Where the multipart parser's two references part ways — the platform's
 * own, undici's `Response.formData()`, and @remix-run/multipart-parser — or
 * where Courier reads a body otherwise than both: each case says which
 * reading RFC 7578, and RFC 2046 under it, calls for, and why, and Courier
 * is held to that reading, never to whichever reference it happens to
 * match. The references' own readings are pinned beside it, undici's for
 * each major a supported Node ships, so an upgrade that changes one is seen
 * rather than followed.
 */
import { MultipartParseError, parseMultipart } from "@remix-run/multipart-parser";
import { describe, expect, it } from "vitest";

import { BodyError } from "../../src/adapter/body-error";
import { readMultipartForm } from "../../src/adapter/multipart/read-form";
import { chunked, concat } from "../helpers/multipart-fixtures";

/** A body as a reader read it: each field's text, each file by its name — or refused. */
type Reading = "refused" | Array<[name: string | null, value: string | { file: string | null }]>;

interface Case {
  body: Uint8Array<ArrayBuffer>;
  /** The reading RFC 7578 calls for, which Courier's is */
  courier: Reading;
  /** @remix-run/multipart-parser's, through its own `isFile` and `text` */
  remix: Reading;
  /** undici's from 7 on — Node 24's and 26's */
  undici: Reading;
  /** undici 6's — Node 22's — where it differs */
  undici6?: Reading;
  /** Why RFC 7578 calls for Courier's reading */
  why: string;
}

const TYPE = "multipart/form-data; boundary=b";
const UNDICI_MAJORS: readonly number[] = [6, 7, 8];
const undiciMajor = Number(process.versions.undici?.split(".")[0]);

/* A one-part form of boundary `b` whose part's headers and content are given. */
const form = (...pieces: Array<string | Uint8Array>): Uint8Array<ArrayBuffer> =>
  concat("--b\r\n", ...pieces, "\r\n--b--\r\n");

const CASES: Record<string, Case> = {
  "a name's escapes, as the HTML standard writes them": {
    body: form('Content-Disposition: form-data; name="q%22d%0D%0Ax"\r\n\r\nx'),
    courier: [['q"d\r\nx', "x"]],
    remix: [["q%22d%0D%0Ax", "x"]],
    undici: [['q"d\r\nx', "x"]],
    why: "RFC 7578 §4.2 lets a sender percent-encode a name, and the HTML standard's encoder, which every browser runs, writes \", CR and LF in one as %22, %0D and %0A; read as sent, a field arrives under a name its form never had. The Fetch standard's parser reverses the three.",
  },
  "a backslash in a quoted filename": {
    body: form('Content-Disposition: form-data; name="f"; filename="dir\\file.txt"\r\n\r\nx'),
    courier: [["f", { file: "dir\\file.txt" }]],
    remix: [["f", { file: "dirfile.txt" }]],
    undici: [["f", { file: "dir\\file.txt" }]],
    why: "RFC 7578 §4.2 takes a filename as the HTML standard writes it, with \" as %22 and no backslash escapes, as browsers send it: a backslash is the file's own. Read as a MIME quoted-pair (RFC 2045 §5.1), it is dropped and the file renamed.",
  },
  "a name that is not UTF-8": {
    body: form(
      'Content-Disposition: form-data; name="a',
      new Uint8Array([0xc3, 0x28]),
      '"\r\n\r\nx',
    ),
    courier: [["a�(", "x"]],
    remix: "refused",
    undici: [["a�(", "x"]],
    why: "RFC 7578 §5.1 has a form's names in its charset, UTF-8 unless a _charset_ field says otherwise, and does not refuse one that fails to decode; the Fetch standard's parser decodes it with U+FFFD for what does not.",
  },
  "a filename* beside the filename": {
    body: form(
      'Content-Disposition: form-data; name="f"; filename="plain.txt"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.txt\r\n',
      "Content-Type: text/plain\r\n\r\nx",
    ),
    courier: [["f", { file: "résumé.txt" }]],
    remix: [["f", { file: "résumé.txt" }]],
    undici: [["f", { file: "résumé.txt" }]],
    undici6: "refused",
    why: "RFC 7578 §4.2 forbids a sender filename*, so a client that sends one anyway means it as the file's name, which RFC 6266 §4.3 reads before filename; refusing the whole upload over it helps nobody.",
  },
  "a field typed application/octet-stream": {
    body: form(
      'Content-Disposition: form-data; name="f"\r\nContent-Type: application/octet-stream\r\n\r\nx',
    ),
    courier: [["f", "x"]],
    remix: [["f", { file: null }]],
    undici: [["f", "x"]],
    why: "A part is a file when its Content-Disposition names a filename (RFC 7578 §4.2), as the Fetch standard makes a File only of such a part; the type a field's content is sent as makes it no file.",
  },
  "a text field opening with a byte order mark": {
    body: form('Content-Disposition: form-data; name="f"\r\n\r\n﻿x'),
    courier: [["f", "﻿x"]],
    remix: [["f", "x"]],
    undici: [["f", "﻿x"]],
    undici6: [["f", "x"]],
    why: "A text field is the bytes sent, decoded as UTF-8 (RFC 7578 §5.1); the Fetch standard decodes it with UTF-8 decode without BOM, which keeps a leading byte order mark. undici 6 and TextDecoder's default drop it.",
  },
  "two hyphens and the boundary in the middle of a line": {
    body: form('Content-Disposition: form-data; name="f"\r\n\r\nx--b'),
    courier: [["f", "x--b"]],
    remix: [["f", "x--b"]],
    undici: "refused",
    why: "A delimiter is CRLF, two hyphens and the boundary (RFC 2046 §5.1.1); the same characters anywhere else are the part's content.",
  },
  "transport padding after a delimiter": {
    body: concat('--b \t\r\nContent-Disposition: form-data; name="f"\r\n\r\nx\r\n--b--\r\n'),
    courier: [["f", "x"]],
    remix: [["f", "x"]],
    undici: "refused",
    why: "RFC 2046 §5.1.1: a receiver MUST be able to handle the spaces and tabs a transport adds after a delimiter, its transport padding.",
  },
  "a bare line feed after the close delimiter": {
    body: concat('--b\r\nContent-Disposition: form-data; name="f"\r\n\r\nx\r\n--b--\n'),
    courier: [["f", "x"]],
    remix: "refused",
    undici: [["f", "x"]],
    undici6: "refused",
    why: "What follows the close delimiter is the epilogue, which a receiver ignores (RFC 2046 §5.1.1): every part has arrived whole.",
  },
  "parameters that run together": {
    body: form('Content-Disposition: form-data; name=""me="a.bin"\r\n\r\nx'),
    courier: "refused",
    remix: [["", "x"]],
    undici: [["", "x"]],
    undici6: "refused",
    why: 'Content-Disposition\'s parameters are separated by semicolons (RFC 7578 §4.2, RFC 2183 §2): one that runs into the next does not parse, and a reader that guesses — a field named "", its filename dropped — may guess otherwise than the upstream that receives the form.',
  },
  "a Content-Disposition sent twice": {
    body: form(
      'Content-Disposition: form-data; name="a"\r\nContent-Disposition: form-data; name="b"\r\n\r\nx',
    ),
    courier: "refused",
    remix: [["b", "x"]],
    undici: [["b", "x"]],
    why: "A part has one Content-Disposition (RFC 7578 §4.2). With two, one parser reads the first and another the last, and the field reaches the upstream under a name the proxy did not read.",
  },
  "a header line with no colon": {
    body: form('Content-Disposition: form-data; name="f"\r\nnot a header\r\n\r\nx'),
    courier: "refused",
    remix: [["f", "x"]],
    undici: "refused",
    why: "A part's headers are header fields (RFC 2046 §5.1.1), each a name, a colon and a value (RFC 5322 §2.2): a line that is not one is no header to pass over.",
  },
  "a header line ending in a bare line feed": {
    body: form('Content-Disposition: form-data; name="f"\nX-A: 1\r\n\r\nx'),
    courier: "refused",
    remix: [["f", "x"]],
    undici: "refused",
    why: "Header lines end with CRLF (RFC 2046 §5.1.1, RFC 5322 §2.2): a bare line feed makes one line two for one parser and one for another.",
  },
  "a part in base64": {
    body: form(
      'Content-Disposition: form-data; name="f"\r\nContent-Transfer-Encoding: base64\r\n\r\neA==',
    ),
    courier: "refused",
    remix: [["f", "eA=="]],
    undici: [["f", "x"]],
    why: "RFC 7578 §4.7 retired Content-Transfer-Encoding, and the references show why: one decodes the part, the other keeps the encoded text, and the upstream could read it either way.",
  },
  "a part with no name": {
    body: form("Content-Disposition: form-data\r\n\r\nx"),
    courier: "refused",
    remix: [[null, "x"]],
    undici: "refused",
    why: "Every part's Content-Disposition carries a name (RFC 7578 §4.2): a part without one has no field to fill.",
  },
};

function entriesOf(read: FormData): Reading {
  return [...read].map(([name, value]) => [
    name,
    typeof value === "string" ? value : { file: value.name },
  ]);
}

async function courierReads(body: Uint8Array<ArrayBuffer>): Promise<Reading> {
  try {
    return entriesOf(
      await readMultipartForm(chunked(body, []).stream, TYPE, { maxFieldBytes: 1024 }),
    );
  } catch (error) {
    if (error instanceof BodyError) return "refused";
    throw error;
  }
}

async function undiciReads(body: Uint8Array<ArrayBuffer>): Promise<Reading> {
  try {
    return entriesOf(await new Response(body, { headers: { "content-type": TYPE } }).formData());
  } catch (error) {
    if (error instanceof TypeError) return "refused";
    throw error;
  }
}

/* A body the parser does not read throws its own error; a header that is not UTF-8, the decoder's. */
function remixReads(body: Uint8Array<ArrayBuffer>): Reading {
  try {
    return [...parseMultipart(body, { boundary: "b" })].map((part) => [
      part.name ?? null,
      part.isFile ? { file: part.filename ?? null } : part.text,
    ]);
  } catch (error) {
    if (error instanceof MultipartParseError || error instanceof TypeError) return "refused";
    throw error;
  }
}

describe("where the multipart parser's references part ways", () => {
  it("knows how this Node's undici reads each body", () => {
    expect(UNDICI_MAJORS, `record how undici ${undiciMajor} reads these bodies`).toContain(
      undiciMajor,
    );
  });

  it.each(Object.entries(CASES))("%s", async (_body, reading) => {
    const undici = undiciMajor === 6 ? (reading.undici6 ?? reading.undici) : reading.undici;

    expect(await undiciReads(reading.body), `undici ${undiciMajor}`).toEqual(undici);
    expect(remixReads(reading.body), "@remix-run/multipart-parser").toEqual(reading.remix);
    expect(await courierReads(reading.body), reading.why).toEqual(reading.courier);
  });
});
