/**
 * A part's header lines and its Content-Disposition, read as browsers write
 * them and refused where the same bytes could be read two ways.
 */
import { describe, expect, it } from "vitest";

import { parseContentDisposition } from "../../src/adapter/multipart/content-disposition";
import { parsePartHeaders } from "../../src/adapter/multipart/part-headers";
import { bytes } from "../helpers/multipart-fixtures";

const malformed = expect.objectContaining({ code: "BODY_MALFORMED", status: 400 });

describe("parseContentDisposition", () => {
  it.each([
    ['form-data; name="a"', { name: "a", filename: undefined }],
    ['Form-Data; NAME="a"; FileName="b.txt"', { name: "a", filename: "b.txt" }],
    ["form-data; name=token; filename=file.txt", { name: "token", filename: "file.txt" }],
    ['form-data; name="q%22uote%0D%0Aline"', { name: 'q"uote\r\nline', filename: undefined }],
    ['form-data; name="a"; filename="C:\\dir\\a.txt"', { name: "a", filename: "C:\\dir\\a.txt" }],
    ['form-data; name="a"; filename=""', { name: "a", filename: "" }],
    ['form-data; name="a;b"; filename="c;d"', { name: "a;b", filename: "c;d" }],
    [
      `form-data; name="a"; filename*=UTF-8''%E2%82%AC%20rates.pdf; filename="rates.pdf"`,
      { name: "a", filename: "€ rates.pdf" },
    ],
    [
      `form-data; name="a"; filename="rates.pdf"; filename*=iso-8859-1'en'%A3.pdf`,
      { name: "a", filename: "£.pdf" },
    ],
  ])("reads %j", (header, disposition) => {
    expect(parseContentDisposition(header)).toEqual(disposition);
  });

  it.each([
    ["another disposition", 'attachment; name="a"'],
    ["no name", 'form-data; filename="a.txt"'],
    ["a name given twice", 'form-data; name="a"; name="b"'],
    ["a quote left open", 'form-data; name="a'],
    ["text after a quoted value", 'form-data; name="a"x'],
    ["a parameter without a value", "form-data; name"],
    ["a filename* in another charset", `form-data; name="a"; filename*=utf-16''%00a`],
    ["a filename* that is not percent-encoded", `form-data; name="a"; filename*=UTF-8''%E2%8`],
    ["a filename* that is not UTF-8", `form-data; name="a"; filename*=UTF-8''%FF`],
  ])("refuses %s", (_case, header) => {
    expect(() => parseContentDisposition(header)).toThrow(malformed);
  });
});

describe("parsePartHeaders", () => {
  it("reads the disposition and the type, whatever the case of their names", () => {
    const block = bytes(
      'content-DISPOSITION: form-data; name="f"; filename="a.png"\r\nContent-Type:  image/png \t\r\n',
    );

    expect(parsePartHeaders(block)).toEqual({ name: "f", filename: "a.png", type: "image/png" });
  });

  it("passes over headers a form gives no meaning, and takes an encoding that keeps the bytes", () => {
    const block = bytes(
      'X-Trace: 1\r\nContent-Disposition: form-data; name="f"\r\nContent-Transfer-Encoding: 8bit\r\n',
    );

    expect(parsePartHeaders(block)).toEqual({ name: "f", filename: undefined, type: undefined });
  });

  it("reads a filename sent as the bytes of its UTF-8", () => {
    const block = bytes('Content-Disposition: form-data; name="f"; filename="résumé.pdf"\r\n');

    expect(parsePartHeaders(block).filename).toBe("résumé.pdf");
  });

  it.each([
    ["no Content-Disposition", "Content-Type: text/plain\r\n"],
    ["no headers at all", ""],
    ["a line ending in a bare line feed", 'Content-Disposition: form-data; name="f"\n'],
    ["a bare carriage return", 'Content-Disposition: form-data; name="f"\rX: 1\r\n'],
    ["a folded line", 'Content-Disposition: form-data;\r\n name="f"\r\n'],
    ["a space before the colon", 'Content-Disposition : form-data; name="f"\r\n'],
    [
      "a header sent twice",
      'Content-Disposition: form-data; name="f"\r\nContent-Disposition: form-data; name="g"\r\n',
    ],
    [
      "a body encoded in base64",
      'Content-Disposition: form-data; name="f"\r\nContent-Transfer-Encoding: base64\r\n',
    ],
  ])("refuses %s", (_case, block) => {
    expect(() => parsePartHeaders(bytes(block))).toThrow(malformed);
  });
});
