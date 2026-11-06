import { describe, expect, it } from "vitest";

import { VIA_KIND } from "../../../src/upgrade/migrations/via-kind";
import { migrateWith } from "./migrate-with";

const HEAD = `import { courier, defineGroup } from "@noverax/courier/define";
const { endpoint, stream } = courier();
`;

describe("0.5.0: a .via() endpoint's kind", () => {
  it("drops the .reads() written after a closure that calls reading verbs alone", () => {
    const { text, findings } = migrateWith(
      VIA_KIND,
      `${HEAD}
export const report = endpoint
  .variables<{ year: number }>()
  .via((http, { year }) => http.get(http.path\`reports/\${year}\`))
  .reads()
  .response<Report>();
export const search = endpoint
  .variables<{ q: string; long: boolean }>()
  .via((http, v) => (v.long ? http.query("search", v) : http.get("search", v))).reads();
export const byId = endpoint.variables<{ id?: string }>().via(function (http, v) {
  if (v.id) return http.get(":id", v);
  return http.head("");
}).reads();
`,
    );

    expect(text).toContain(
      `.via((http, { year }) => http.get(http.path\`reports/\${year}\`))\n  .response<Report>();`,
    );
    expect(text).toContain('http.get("search", v)));');
    expect(text).toContain('return http.head("");\n});');
    expect(text).not.toContain(".reads()");
    expect(findings).toEqual([]);
  });

  it("keeps a .reads() its closure needs, and one after a closure it cannot read for certain", () => {
    const code = `${HEAD}
const probe = (http: HttpWire) => http.get("a");
export const a = endpoint.via((http, v) => (v.long ? http.post("s", v) : http.get("s", v))).reads();
export const b = endpoint.via((http, v): WireCall => http.get("b", v)).reads();
export const c = endpoint.via((http: any) => http.get("c")).reads();
export const d = endpoint.via(probe).reads();
export const e = endpoint.via((http) => { log(http); return http.get("e"); }).reads();
export const f = endpoint.via((http) => http.get("f")).response<F>().reads();
export const g = endpoint.via((http) => http.get("g")) /* a read */ .reads();
export const h = stream.via((sse) => sse.get("h")).reads();
export const i = elsewhere.via((http) => http.get("i")).reads();
export const j = endpoint.via(async (http) => http.get("j")).reads();
export const k = endpoint.via((http) => { if (x) return http.get("k"); return; }).reads();
`;

    const kept = migrateWith(VIA_KIND, code);

    expect(kept.text).toBe(code);
    expect(kept.findings).toEqual([]);
  });

  it("finds an endpoint that names no kind where its closure calls a reading verb, or verbs of both kinds", () => {
    const { text, findings } = migrateWith(
      VIA_KIND,
      `${HEAD}
export const read = endpoint.via((http) => http.get("a"));
export const both = endpoint.variables<V>().via((http, v) => (v.long ? http.post("s", v) : http.get("s", v)));
export const write = endpoint.via((http, v) => http.post("b", v));
export const named = endpoint.via((http) => http.get("c")).writes();
export const group = defineGroup({ prefix: "x", endpoints: { d: endpoint.via((http) => http.options("d")) } });
const base = endpoint.via((http) => http.get("e"));
export const later = base.reads();
export const wrapped = wrap(endpoint.via((http) => http.get("f")));
`,
    );

    expect(text).not.toContain(".reads().");
    expect(findings.map((finding) => [finding.line, finding.instead])).toEqual([
      [4, [".via(…).writes()"]],
      [5, [".via(…).reads()", ".via(…).writes()"]],
      [8, [".via(…).writes()"]],
    ]);
    expect(findings[0]?.what).toMatch(
      /^its closure calls a reading verb, so the endpoint reads, where 0.4 took it for a write/,
    );
    expect(findings[1]?.what).toMatch(/a write until now, names its kind/);
  });
});
