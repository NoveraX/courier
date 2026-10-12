/**
 * Before a merged file is offered, it is read back by its syntax and held to
 * what the merge meant to write: the file's own declaration, exactly the
 * merged endpoints, every top-level name the file declared, and no name in
 * its code that neither file it came from has in its code. A merged file
 * that fails any of these is never offered as a success.
 */
import { describe, expect, it } from "vitest";

import { type DeclarationLayout, readLayout } from "../../../src/apis/merge/declaration-layout";
import { holdsMerge } from "../../../src/apis/merge/holds-merge";
import { mergeGroupFile } from "../../../src/apis/merge/merge-group";
import type { MergedEntry } from "../../../src/apis/merge/place-under-prefix";

const ON_DISK = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** Lists users; ZZ_COMMENTED is a word of this comment alone. */
    list: endpoint.get(""),
    mine: endpoint.get("mine"),
  },
});

export function helper(): number {
  return 1;
}
`;

const GENERATED = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** Lists users; ZZ_COMMENTED is a word of this comment alone. */
    list: endpoint.get(""),
    create: endpoint.post(""),
  },
});
`;

const ENTRIES: MergedEntry[] = [
  {
    name: "list",
    comment: "    /** Lists users; ZZ_COMMENTED is a word of this comment alone. */",
    code: '    list: endpoint.get(""),',
    kept: false,
  },
  { name: "create", code: '    create: endpoint.post(""),', kept: false },
  { name: "mine", code: '    mine: endpoint.get("mine"),', kept: true },
];

function layout(content: string): DeclarationLayout {
  const read = readLayout(content);
  if (read === null) throw new Error("the fixture has no layout");
  return read;
}

const MERGED = mergeGroupFile(ON_DISK, GENERATED, {
  endpoints: { list: "safe", create: "new", mine: "modified" },
  existingCode: {},
}).content;

function holds(content: string): boolean {
  return holdsMerge(content, layout(ON_DISK), layout(GENERATED), ENTRIES);
}

describe("a merged file read back", () => {
  it("holds a merge that wrote what it meant to", () => {
    expect(holds(MERGED)).toBe(true);
  });

  it("does not hold a merge that turned a comment's word into code", () => {
    expect(holds(`${MERGED}\nexport const ZZ_COMMENTED = 1;\n`)).toBe(false);
  });

  it("does not hold an endpoint the merge did not write", () => {
    const extra = MERGED.replace(
      '    mine: endpoint.get("mine"),\n',
      '    mine: endpoint.get("mine"),\n    list2: endpoint.get(""),\n',
    );

    expect(holds(extra)).toBe(false);
  });

  it("does not hold an endpoint written other than merged", () => {
    expect(holds(MERGED.replace('endpoint.post("")', 'endpoint.post("elsewhere")'))).toBe(false);
  });

  it("does not hold endpoints in another order", () => {
    const swapped = MERGED.replace(
      '    create: endpoint.post(""),\n    mine: endpoint.get("mine"),',
      '    mine: endpoint.get("mine"),\n    create: endpoint.post(""),',
    );

    expect(holds(swapped)).toBe(false);
  });

  it("does not hold a merge that lost code the file declared", () => {
    expect(holds(MERGED.replace(/export function helper[\s\S]*?\n}\n/, ""))).toBe(false);
  });

  it("does not hold a declaration other than the file's own", () => {
    expect(
      holds(MERGED.replace("export const users = defineGroup", "export const users = defineApi")),
    ).toBe(false);
  });

  it("does not hold a file that no longer parses", () => {
    expect(holds(MERGED.replace("  },\n});", "  },\n"))).toBe(false);
  });
});
