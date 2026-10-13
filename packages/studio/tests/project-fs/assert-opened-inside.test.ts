/**
 * A file read by a path inside the project is the file that path names
 * inside it once it is open: a directory on the way swapped for a link to
 * elsewhere, between the checks before the open and the open itself — or
 * between the looks taken after it — makes the read refused, not a read of
 * a file outside the project. A project reached through a link of its own
 * reads as any other.
 */
import type * as Fs from "node:fs";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertOpenedInside } from "../../src/server/project-fs/assert-opened-inside";
import { projectRootAt } from "../../src/server/project-fs/project-root";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, statSync: vi.fn(actual.statSync) };
});

let base: string;
let project: string;
let outside: string;
const open: number[] = [];

/* The scratch folder as the platform names it: on macOS `/var/…`, a link to `/private/var/…`. */
function scratch(): string {
  const unresolved = mkdtempSync(join(tmpdir(), "courier-opened-inside-"));
  project = join(unresolved, "project");
  outside = join(unresolved, "outside");
  mkdirSync(join(project, "d"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(project, "d", "spec.yaml"), "inside");
  writeFileSync(join(outside, "spec.yaml"), "outside");
  return unresolved;
}

beforeEach(() => {
  base = scratch();
});

afterEach(() => {
  vi.mocked(statSync).mockReset();
  for (const fd of open.splice(0)) closeSync(fd);
  rmSync(base, { recursive: true, force: true });
});

function opened(path: string): number {
  const fd = openSync(path, "r");
  open.push(fd);
  return fd;
}

/* The directory on the way becomes a link to the outside one, as a racing process would make it. */
function swapForLink(): void {
  renameSync(join(project, "d"), join(project, "d-real"));
  symlinkSync(outside, join(project, "d"));
}

function swapBack(): void {
  unlinkSync(join(project, "d"));
  renameSync(join(project, "d-real"), join(project, "d"));
}

describe.skipIf(process.platform === "win32")("assertOpenedInside", () => {
  it("lets a file through that its path names inside the project", () => {
    const path = join(project, "d", "spec.yaml");

    expect(() => assertOpenedInside(projectRootAt(project), path, opened(path))).not.toThrow();
  });

  it("refuses a file whose path leads outside the project once it is open", () => {
    const path = join(project, "d", "spec.yaml");
    const fd = opened(path);

    swapForLink();

    expect(() => assertOpenedInside(projectRootAt(project), path, fd)).toThrow(
      'Studio refused "d/spec.yaml": a symbolic link on the way leads outside the project.',
    );
  });

  it("refuses a file opened through a link swapped in and out again around the open", () => {
    const path = join(project, "d", "spec.yaml");
    swapForLink();
    const fd = opened(path);
    swapBack();

    expect(readFileSync(fd, "utf8")).toBe("outside");
    expect(() => assertOpenedInside(projectRootAt(project), path, fd)).toThrow(
      'Studio refused "d/spec.yaml": it was replaced while Studio opened it.',
    );
  });

  it("refuses a file a link swapped in again after its path resolved inside makes look like the path's", async () => {
    const actual = await vi.importActual<typeof Fs>("node:fs");
    const path = join(project, "d", "spec.yaml");
    swapForLink();
    const fd = opened(path);
    swapBack();
    /* Every look at a name from here follows the link to the file the descriptor reads. */
    vi.mocked(statSync).mockImplementationOnce((...args: Parameters<typeof actual.statSync>) => {
      swapForLink();
      return actual.statSync(...args);
    });

    expect(() => assertOpenedInside(projectRootAt(project), path, fd)).toThrow(
      'Studio refused "d/spec.yaml": it was replaced while Studio opened it.',
    );
  });

  it("lets a file through in a project reached through a link of its own", () => {
    symlinkSync(project, join(base, "project-link"));
    const root = projectRootAt(join(base, "project-link"));
    const path = join(root.path, "d", "spec.yaml");

    expect(root.real).toBe(realpathSync(project));
    expect(() => assertOpenedInside(root, path, opened(path))).not.toThrow();
  });

  it("lets a file through in a project named through the platform's own links, and still refuses one outside", () => {
    const root = projectRootAt(project);
    const inside = join(project, "d", "spec.yaml");
    symlinkSync(outside, join(project, "out"));
    const leaving = join(project, "out", "spec.yaml");

    expect(() => assertOpenedInside(root, inside, opened(inside))).not.toThrow();
    expect(() => assertOpenedInside(root, leaving, opened(leaving))).toThrow(
      'Studio refused "out/spec.yaml": a symbolic link on the way leads outside the project.',
    );
  });
});
