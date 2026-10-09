import { describe, expect, it } from "vitest";

import { addNamedImport } from "../../src/edit/named-import";
import { scanSource } from "../../src/edit/source-scan";

const ROUTES = 'import { type RouteConfig, index } from "@react-router/dev/routes";\n';

describe("addNamedImport", () => {
  it("adds the name after the module's last import", () => {
    const scan = scanSource(ROUTES);

    expect(scan && addNamedImport(scan, "@react-router/dev/routes", "route")).toBe(
      'import { type RouteConfig, index, route } from "@react-router/dev/routes";\n',
    );
  });

  it("leaves a file that imports the name already as it is", () => {
    const text = 'import { index, route as r } from "@react-router/dev/routes";\n';
    const scan = scanSource(text);

    expect(scan && addNamedImport(scan, "@react-router/dev/routes", "index")).toBe(text);
  });

  it("refuses a file without such an import", () => {
    const scan = scanSource('import x from "@react-router/dev/routes";\n');

    expect(scan && addNamedImport(scan, "@react-router/dev/routes", "route")).toBeUndefined();
  });
});
