import { describe, expect, it } from "vitest";

import { scriptsEdit } from "../../src/plan/package-scripts";

const MANIFEST = '{\n\t"name": "app",\n\t"scripts": {\n\t\t"dev": "vite dev"\n\t}\n}\n';

describe("scriptsEdit", () => {
  it("adds a script in the file's own indentation, keeping its last line break", () => {
    const [edit] = scriptsEdit({ studio: "courier-studio" }, []);

    expect(edit?.change(MANIFEST)).toBe(
      '{\n\t"name": "app",\n\t"scripts": {\n\t\t"dev": "vite dev",\n\t\t"studio": "courier-studio"\n\t}\n}\n',
    );
  });

  it("keeps a script the project has under that name, and reports no change", () => {
    const [edit] = scriptsEdit({ dev: "courier-studio" }, []);

    expect(edit?.change(MANIFEST)).toBe(MANIFEST);
  });

  it("rewrites a script of the project's", () => {
    const [edit] = scriptsEdit({}, [
      { script: "dev", why: "why", change: (command) => `${command} --open` },
    ]);

    expect(edit?.change(MANIFEST)).toContain('"dev": "vite dev --open"');
  });

  it("is no edit at all where there is nothing to change", () => {
    expect(scriptsEdit({}, [])).toEqual([]);
  });

  it("refuses a package.json that is not an object", () => {
    expect(scriptsEdit({ studio: "x" }, [])[0]?.change("[]")).toBeUndefined();
  });
});
