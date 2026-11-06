import { describe, expect, it } from "vitest";

import { HTTP_PROBE_TYPE } from "../../../src/upgrade/migrations/http-probe-type";
import { migrateWith } from "./migrate-with";

const HEAD = `import { courier } from "@noverax/courier/define";
import type { HttpProbe } from "@noverax/courier/define";
const { endpoint } = courier();
`;

describe("0.5.0: a closure typed HttpProbe<Variables>", () => {
  it("is found with the type that names the call it returns, of the kind its verbs give", () => {
    const code = `${HEAD}
const byId: HttpProbe<{ id: string }> = (http, vars) => http.get(":id", vars);
export const getById = endpoint.variables<{ id: string }>().via(byId).response<User>();
export const create: HttpProbe<NewUser> = (http, user) => http.post("", user);
export function paged<V>(path: string): HttpProbe<V & { page: number }> {
  return (http, v) => http.get(path, v);
}
const named: HttpProbe<{ id: string }, WireCall<"query">> = (http, vars) => http.get(":id", vars);
`;

    const { text, findings } = migrateWith(HTTP_PROBE_TYPE, code);

    expect(text).toBe(code);
    expect(findings.map((finding) => [finding.line, finding.instead])).toEqual([
      [5, ['HttpProbe<{ id: string }, WireCall<"query">>']],
      [7, ['HttpProbe<NewUser, WireCall<"mutation">>']],
      [
        8,
        [
          'HttpProbe<V & { page: number }, WireCall<"query">>',
          'HttpProbe<V & { page: number }, WireCall<"mutation">>',
        ],
      ],
    ]);
    expect(findings[0]?.what).toMatch(/^HttpProbe<Variables> no longer says which verb/);
  });

  it("is found under the name the file imports it by, where a .via() of it names no kind or the file exports it", () => {
    const { findings } = migrateWith(
      HTTP_PROBE_TYPE,
      `import type { HttpProbe as Probe } from "@noverax/courier/define";
import { courier } from "@noverax/courier/define";
const { endpoint } = courier();
const byId: Probe<{ id: string }> = (http, vars) => http.get(":id", vars);
export const a = endpoint.via(byId).reads();
export const b = endpoint.via(byId);
const other: Probe<{ id: string }> = (http, vars) => http.get(":id", vars);
export { other };
`,
    );

    expect(findings.map((finding) => [finding.line, finding.instead[0]])).toEqual([
      [4, 'Probe<{ id: string }, WireCall<"query">>'],
      [7, 'Probe<{ id: string }, WireCall<"query">>'],
    ]);
  });

  it("needs nothing where every .via() of the file's own const names its kind, and finds no type of another module", () => {
    const named = migrateWith(
      HTTP_PROBE_TYPE,
      `${HEAD}
const byId: HttpProbe<{ id: string }> = (http, vars) => http.get(":id", vars);
export const a = endpoint.variables<{ id: string }>().via(byId).reads();
export const b = endpoint.variables<{ id: string }>().via(byId).writes().response<User>();
`,
    );
    const another = migrateWith(
      HTTP_PROBE_TYPE,
      `import type { HttpProbe } from "./probe";
const probe: HttpProbe<V> = (http) => http.get("a");
`,
    );

    expect(named.findings).toEqual([]);
    expect(another.findings).toEqual([]);
  });
});
