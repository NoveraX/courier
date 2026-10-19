/**
 * The parent each OpenAPI 3.2 tag declares, kept when the specification
 * declares that parent too and the chain above it runs into no loop —
 * found in one walk of each tag, however long the chains run.
 */
import { describe, expect, it } from "vitest";

import { tagParents } from "../../../src/apis/parser/tag-parents";
import { seededRandom } from "../../helpers/seeded-random";

function tags(...declared: Array<[name: string, parent?: string]>) {
  return { tags: declared.map(([name, parent]) => ({ name, ...(parent && { parent }) })) };
}

/* The reading this one replaced, as it stood: a walk up from each parent, looking for a loop. */
function walkingTagParents(declared: ReadonlyMap<string, string | undefined>): Map<string, string> {
  const parents = new Map<string, string>();
  for (const [name, parent] of declared) {
    if (parent !== undefined && declared.has(parent) && !reaches(declared, parent, name)) {
      parents.set(name, parent);
    }
  }
  return parents;
}

function reaches(
  declared: ReadonlyMap<string, string | undefined>,
  from: string,
  to: string,
): boolean {
  const seen = new Set<string>();
  for (let at: string | undefined = from; at !== undefined; at = declared.get(at)) {
    if (at === to || seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}

describe("tagParents", () => {
  it("keeps each declared parent", () => {
    expect(tagParents(tags(["Billing"], ["Invoices", "Billing"], ["Lines", "Invoices"]))).toEqual(
      new Map([
        ["Invoices", "Billing"],
        ["Lines", "Invoices"],
      ]),
    );
  });

  it("drops every parent that leads into a loop, whichever tag the loop runs through", () => {
    expect(tagParents(tags(["a", "b"], ["b", "a"], ["c", "a"], ["d", "c"], ["e", "e"]))).toEqual(
      new Map(),
    );
  });

  it("drops a parent the specification does not declare, and keeps the tags below it", () => {
    expect(tagParents(tags(["Invoices", "Ghost"], ["Lines", "Invoices"]))).toEqual(
      new Map([["Lines", "Invoices"]]),
    );
  });

  it("takes a tag's last declaration", () => {
    expect(tagParents(tags(["A"], ["B", "A"], ["B"]))).toEqual(new Map());
  });

  it("walks a chain of 100 000 tags without recursion", () => {
    const chain = Array.from({ length: 100_000 }, (_, at): [string, string?] =>
      at === 0 ? ["t0"] : [`t${at}`, `t${at - 1}`],
    );

    expect(tagParents(tags(...chain)).size).toBe(99_999);
  });

  it("keeps what the walk from each parent kept, on 5 000 random graphs of tags with loops", () => {
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const next = seededRandom(seed);
      const count = 1 + next(10);
      /* A parent may be any tag, itself included, or one never declared. */
      const declared = Array.from({ length: count }, (_, at): [string, string?] => {
        const pick = next(count + 2);
        if (pick === count + 1) return [`t${at}`];
        return [`t${at}`, pick < count ? `t${pick}` : "ghost"];
      });
      const twice = declared.concat(next(4) === 0 ? [[`t${next(count)}`, `t${next(count)}`]] : []);
      const byName = new Map(
        twice.map(([name, parent]): [string, string | undefined] => [name, parent]),
      );

      expect(tagParents(tags(...twice))).toEqual(walkingTagParents(byName));
    }
  });
});
