import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { manifestEdits } from "../../src/upgrade/manifest-edits";
import { courierPackages } from "../../src/upgrade/project-packages";
import { parseVersion } from "../../src/upgrade/versions";
import { projectWith, removeProjects } from "../helpers/temp-project";

afterAll(removeProjects);

const TARGET = parseVersion("0.5.0") ?? { major: 0, minor: 5, patch: 0, pre: "" };

/* A manifest as a person writes one: tabs, a key out of order, and a package of Courier's at the target already. */
const WRITTEN = `{
\t"name": "shop",
\t"dependencies": {
\t\t"zod": "^4.0.0",
\t\t"@noverax/courier": "^0.4.0",
\t\t"@noverax/courier-next": "0.5.0"
\t},
\t"peerDependencies": { "@noverax/courier-react": "*" },
\t"devDependencies": {
\t\t"@noverax/courier-studio": "~0.4.1"
\t}
}
`;

describe("manifestEdits", () => {
  it("raises each range where it is written, leaves the rest of the file as it is, and says why one is left", () => {
    const root = projectWith({ "package.json": WRITTEN });

    const { edits, packages } = manifestEdits(
      root,
      courierPackages({ root, packages: [""] }),
      TARGET,
    );

    expect(edits).toHaveLength(1);
    expect(edits[0]?.after).toBe(
      WRITTEN.replace('"^0.4.0"', '"^0.5.0"').replace('"~0.4.1"', '"~0.5.0"'),
    );
    expect(edits[0]?.before).toBe(readFileSync(join(root, "package.json"), "utf8"));
    expect(packages).toEqual([
      {
        manifest: "package.json",
        name: "@noverax/courier",
        field: "dependencies",
        from: "^0.4.0",
        to: "^0.5.0",
      },
      {
        manifest: "package.json",
        name: "@noverax/courier-studio",
        field: "devDependencies",
        from: "~0.4.1",
        to: "~0.5.0",
      },
      {
        manifest: "package.json",
        name: "@noverax/courier-react",
        field: "peerDependencies",
        from: "*",
        to: undefined,
        why: "it allows 0.5.0",
      },
    ]);
  });

  it("changes nothing where every range is at the target already", () => {
    const root = projectWith({
      "package.json": '{ "dependencies": { "@noverax/courier": "^0.5.0" } }\n',
    });

    expect(manifestEdits(root, courierPackages({ root, packages: [""] }), TARGET)).toEqual({
      edits: [],
      packages: [],
    });
  });
});
