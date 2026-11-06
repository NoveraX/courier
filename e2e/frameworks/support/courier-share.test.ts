/**
 * Courier's share of a page, read through each chunk's source map: the
 * code each segment of Courier's sources maps, up to where the next
 * segment begins — or the next module does, whose wrapper the bundler
 * writes and no source holds. Turbopack writes a module's ids and its
 * factory after the one before, webpack its id as a key, and the share is
 * read the same way for both.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courierShare } from "./courier-share";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const COURIER = "webpack://_N_E/node_modules/@noverax/courier/lib/a.js";
const OTHER = "webpack://_N_E/node_modules/other/lib/b.js";
let root: string;

function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let digits = "";
  do {
    const digit = rest & 31;
    rest >>>= 5;
    digits += BASE64[digit | (rest > 0 ? 32 : 0)];
  } while (rest > 0);
  return digits;
}

/* A page that loads one chunk of one line, a segment at each text given, of the source given. */
function build(code: string, segments: readonly (readonly [string, number])[]): void {
  let column = 0;
  let source = 0;
  const mappings = segments
    .map(([text, of]) => {
      const at = code.indexOf(text);
      const segment = `${vlq(at - column)}${vlq(of - source)}AA`;
      column = at;
      source = of;
      return segment;
    })
    .join(",");
  mkdirSync(join(root, ".next/server/app/bundle"), { recursive: true });
  mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
  writeFileSync(
    join(root, ".next/server/app/bundle/page.html"),
    '<script src="/_next/static/chunks/page.js"></script>',
  );
  writeFileSync(
    join(root, ".next/static/chunks/page.js"),
    `${code}\n//# sourceMappingURL=page.js.map`,
  );
  writeFileSync(
    join(root, ".next/static/chunks/page.js.map"),
    JSON.stringify({ version: 3, sources: [COURIER, OTHER], mappings }),
  );
}

function share(): { bytes: number; gzipped: number } {
  return courierShare(root, "bundle/page", (source) => source.includes("/@noverax/"), COURIER, []);
}

function sized(text: string): { bytes: number; gzipped: number } {
  return { bytes: text.length, gzipped: gzipSync(text).length };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-share-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("courierShare", () => {
  it("ends a segment where Turbopack's next module begins, its wrapper no source's", () => {
    build(
      'T.push([0,7,e=>{"use strict";e.s(["a",()=>a]);function a(){return 1}},81,94,e=>{"use strict";e.s(["b",()=>b]);function b(){return 2}}]);',
      [
        ["function a", 0],
        ["function b", 1],
      ],
    );

    expect(share()).toEqual(sized("function a(){return 1}"));
  });

  it("ends a segment where webpack's next module begins, its wrapper no source's", () => {
    build(
      "W.push([[3],{7:(e,t,r)=>{r.d(t,{a:()=>a});function a(){return 1}},81:(e,t,r)=>{r.d(t,{b:()=>b});function b(){return 2}}}]);",
      [
        ["function a", 0],
        ["function b", 1],
      ],
    );

    expect(share()).toEqual(sized("function a(){return 1}"));
  });

  it("takes nothing of a module no map names, nor of the rest of the line", () => {
    build(
      'T.push([0,7,e=>{"use strict";function a(){return 1}},81,e=>{"use strict";function unnamed(){return 3}}]);',
      [["function a", 0]],
    );

    expect(share()).toEqual(sized("function a(){return 1}"));
  });
});
