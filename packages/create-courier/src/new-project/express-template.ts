import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
`;

const SERVER = `import express from "express";

const app = express();

app.get("/", (_request, response) => {
  response.send("Hello from Express");
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(\`Server is running on http://localhost:\${port}\`);
});
`;

const GITIGNORE = "node_modules\ndist\n.env\n";

/**
 * A new Express server in TypeScript, as small as a server is: one route,
 * run by `tsx` while you develop and compiled by `tsc` to run in
 * production. Express has no generator of its own; its packages are added
 * by the install that follows.
 *
 * @param root - The new project's folder
 * @param name - Its name, for package.json
 * @returns The packages to install, as dependencies and dev dependencies
 * @example
 * ```ts
 * writeExpressTemplate("/work/api", "api");
 * ```
 */
export function writeExpressTemplate(
  root: string,
  name: string,
): { dependencies: string[]; devDependencies: string[] } {
  const manifest = {
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { dev: "tsx watch src/server.ts", build: "tsc", start: "node dist/server.js" },
  };
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(root, "tsconfig.json"), TSCONFIG);
  writeFileSync(join(root, "src/server.ts"), SERVER);
  writeFileSync(join(root, ".gitignore"), GITIGNORE);
  return {
    dependencies: ["express"],
    devDependencies: ["@types/express", "@types/node", "tsx", "typescript@^6"],
  };
}
