import { describe, expect, it } from "vitest";

import { withJsonStrings } from "../../src/edit/json-strings";

describe("withJsonStrings", () => {
  it("adds after the last value on its line where the object is written on one", () => {
    const text = `{ "name": "app", "scripts": { "dev": "next dev" },
  "dependencies": { "next": "16.4.0" } }
`;

    expect(withJsonStrings(text, "scripts", { studio: "courier-studio" })).toBe(
      `{ "name": "app", "scripts": { "dev": "next dev", "studio": "courier-studio" },
  "dependencies": { "next": "16.4.0" } }
`,
    );
  });

  it("adds on lines of their own, at the indentation the object's values have", () => {
    const text = '{\n\t"scripts": {\n\t\t"dev": "vite"\n\t},\n\t"private": true\n}\n';

    expect(
      withJsonStrings(text, "scripts", { studio: "courier-studio", routes: "courier-cli routes" }),
    ).toBe(
      '{\n\t"scripts": {\n\t\t"dev": "vite",\n\t\t"studio": "courier-studio",\n\t\t"routes": "courier-cli routes"\n\t},\n\t"private": true\n}\n',
    );
  });

  it("replaces a value where it is written, and leaves the other lines as they are", () => {
    const text =
      '{\n    "scripts": {\n        "dev": "fastify start -w -l info app.js",\n        "test": "node --test"\n    }\n}\n';

    expect(
      withJsonStrings(text, "scripts", {
        dev: "fastify start --ignore-watch=.courier -w -l info app.js",
      }),
    ).toBe(
      '{\n    "scripts": {\n        "dev": "fastify start --ignore-watch=.courier -w -l info app.js",\n        "test": "node --test"\n    }\n}\n',
    );
  });

  it("adds the object where the file has none, and fills an empty one", () => {
    const none = '{\n  "name": "app",\n  "private": true\n}\n';
    const empty = '{\n  "name": "app",\n  "scripts": {}\n}\n';

    expect(withJsonStrings(none, "scripts", { studio: "courier-studio" })).toBe(
      '{\n  "name": "app",\n  "private": true,\n  "scripts": {\n    "studio": "courier-studio"\n  }\n}\n',
    );
    expect(withJsonStrings(empty, "scripts", { studio: "courier-studio" })).toBe(
      '{\n  "name": "app",\n  "scripts": {\n    "studio": "courier-studio"\n  }\n}\n',
    );
  });

  it("writes a command's quotes and backslashes escaped", () => {
    const text = '{ "scripts": {} }';
    const after = withJsonStrings(text, "scripts", { studio: 'run "a\\b"' });

    expect(JSON.parse(after ?? "").scripts).toEqual({ studio: 'run "a\\b"' });
  });

  it("refuses a file that is not one object, and a key that holds something else", () => {
    expect(withJsonStrings("[1, 2]", "scripts", { a: "b" })).toBeUndefined();
    expect(withJsonStrings('{ "scripts": "none" }', "scripts", { a: "b" })).toBeUndefined();
  });
});
