import { describe, expect, it } from "vitest";
import type { GeneratedFile } from "../src/apis/generator/types";
import { computeHash } from "../src/apis/merge/hash";
import { previewUpdate } from "../src/apis/merge/update-flow";

// ── Helpers ──────────────────────────────────────────────────────────────────

const GROUP_CONTENT = `import { courier, defineGroup } from "@noverax/courier/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
  },
});
`;

const INDEX_CONTENT = `export { users } from "./users";
`;

function makeFingerprints(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /^\s{4}(\w+):\s*(?:\w+\.)?(?:endpoint|stream|channel)\b/gm;
  let match: RegExpExecArray | null = re.exec(content);
  while (match) {
    const name = match[1]!;
    result[name] = computeHash(getEndpointLine(content, name));
    match = re.exec(content);
  }
  return result;
}

function getEndpointLine(content: string, name: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.match(new RegExp(`^\\s+${name}:\\s*(?:\\w+\\.)?(?:endpoint|stream|channel)\\b`)))
      return line;
  }
  throw new Error(`Endpoint "${name}" not found in test fixture`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("previewUpdate", () => {
  it("returns safe status when no existing files", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
      { path: "src/api/test/index.ts", content: INDEX_CONTENT },
    ];

    const result = previewUpdate(fingerprints, generated, {});

    expect(result.files).toHaveLength(2);
    expect(result.files[0]!.status).toBe("safe");
    expect(result.files[1]!.status).toBe("safe");
    expect(result.files[0]!.content).toBe(GROUP_CONTENT);
  });

  it("returns safe status for unchanged group files", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const generated: GeneratedFile[] = [{ path: "src/api/test/users.ts", content: GROUP_CONTENT }];
    const existing = { "src/api/test/users.ts": GROUP_CONTENT };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.files[0]!.status).toBe("safe");
    expect(result.files[0]!.content).toContain("getAll");
    expect(result.files[0]!.content).toContain("getById");
  });

  it("preserves user modifications in group files", () => {
    const userModified = GROUP_CONTENT.replace('.get("")', '.get("archive")');
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const newGenerated = GROUP_CONTENT.replace(
      "endpoint.response<User[]>()",
      "endpoint.response(z.array(UserSchema))",
    );
    const generated: GeneratedFile[] = [{ path: "src/api/test/users.ts", content: newGenerated }];
    const existing = { "src/api/test/users.ts": userModified };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.files[0]!.status).toBe("merged");
    expect(result.files[0]!.content).toContain('.get("archive")');
  });

  it("adds new endpoints from updated spec", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const newGenerated = GROUP_CONTENT.replace(
      "  },\n});",
      '    create: endpoint.variables<CreateVars>().via((http, vars) => http.post("", vars)).response<User>(),\n  },\n});',
    );
    const generated: GeneratedFile[] = [{ path: "src/api/test/users.ts", content: newGenerated }];
    const existing = { "src/api/test/users.ts": GROUP_CONTENT };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.files[0]!.content).toContain("create:");
    expect(result.files[0]!.content).toContain("http.post");
  });

  it("overwrites non-group files without merge", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const newIndex = `export { users } from "./users";\nexport { posts } from "./posts";\n`;
    const generated: GeneratedFile[] = [{ path: "src/api/test/index.ts", content: newIndex }];
    const existing = { "src/api/test/index.ts": INDEX_CONTENT };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.files[0]!.status).toBe("safe");
    expect(result.files[0]!.content).toBe(newIndex);
  });

  it("returns empty breakingChanges", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const generated: GeneratedFile[] = [{ path: "src/api/test/users.ts", content: GROUP_CONTENT }];

    const result = previewUpdate(fingerprints, generated, {});

    expect(result.breakingChanges).toEqual([]);
  });

  it("detects files on disk no longer in generated set", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const generated: GeneratedFile[] = [{ path: "src/api/test/users.ts", content: GROUP_CONTENT }];
    const existing = {
      "src/api/test/users.ts": GROUP_CONTENT,
      "src/api/test/old-group.ts": "// stale file",
    };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.deletedFiles).toContain("src/api/test/old-group.ts");
  });

  it("preserves user-added endpoints not in new spec", () => {
    const existingWithCustom = GROUP_CONTENT.replace(
      "  },\n});",
      '    myCustom: endpoint.post("custom"),\n  },\n});',
    );
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    /* Generated has only getAll, getById — no myCustom */
    const generated: GeneratedFile[] = [{ path: "src/api/test/users.ts", content: GROUP_CONTENT }];
    const existing = { "src/api/test/users.ts": existingWithCustom };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.files[0]!.content).toContain("myCustom");
    expect(result.files[0]!.content).toContain('endpoint.post("custom")');
  });

  it("handles multiple files with mixed statuses", () => {
    const fingerprints = makeFingerprints(GROUP_CONTENT);
    const postsGroup = GROUP_CONTENT.replace(/users/g, "posts").replace(/User/g, "Post");
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
      { path: "src/api/test/posts.ts", content: postsGroup },
      { path: "src/api/test/index.ts", content: INDEX_CONTENT },
    ];
    const existing = {
      "src/api/test/users.ts": GROUP_CONTENT,
      /* posts.ts is new — no existing file */
    };

    const result = previewUpdate(fingerprints, generated, existing);

    expect(result.files).toHaveLength(3);
    /* users.ts — existing, unchanged → safe merge */
    expect(result.files[0]!.path).toBe("src/api/test/users.ts");
    /* posts.ts — no existing → safe overwrite */
    expect(result.files[1]!.status).toBe("safe");
    /* index.ts — non-group → safe overwrite */
    expect(result.files[2]!.status).toBe("safe");
  });
});
