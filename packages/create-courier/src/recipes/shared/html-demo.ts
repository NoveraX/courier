import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, unreachableText } from "./demo-parts";
import { DEMO_CSS } from "./demo-style";

/**
 * The files a server's demo page is made of: `server-caller.ts`, the
 * example API's client for server code, and `page.ts`, which writes the
 * page — the users the API answered with, or why it did not, and a form
 * that posts a new one back to the page.
 *
 * @param ctx - The project, and what is set up in it
 * @param dir - The folder Courier's own modules go in
 * @returns The two files
 * @example
 * ```ts
 * htmlDemo(ctx, "src/courier");
 * ```
 */
export function htmlDemo(ctx: RecipeContext, dir: string): RecipeFile[] {
  const callerPath = `${dir}/server-caller.ts`;
  const pagePath = `${dir}/page.ts`;
  const caller = `import { createCaller } from "@noverax/courier";

import { api } from "${importSpecifier(callerPath, `${dir}/api.ts`, ctx.extension)}";

/** Your API's client for server code, which calls it directly. */
export const caller = createCaller(api);
`;
  const page = `import type { z } from "zod";

import type { User } from "${importSpecifier(pagePath, `${dir}/api.ts`, ctx.extension)}";

const css = \`${DEMO_CSS}\`;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => \`&#\${char.charCodeAt(0)};\`);
}

/**
 * The page that shows Courier at work: the users your API answered with,
 * or why it did not, and a form that posts a new one back to it.
 */
export function usersPage(users: z.infer<typeof User>[] | Error): string {
  const body =
    users instanceof Error
      ? \`<p role="alert">Could not load users: \${escape(users.message)}. ${unreachableText(ctx, "API_URL")}</p>\`
      : \`<ul>\${users.map((user) => \`<li>\${escape(user.name)} <small>\${escape(user.email)}</small></li>\`).join("")}</ul>
<form method="post" action="/courier"><input name="name" placeholder="Name" required /><button type="submit">${DEMO_TEXT.add}</button></form>\`;
  return \`<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><meta name="color-scheme" content="light dark" /><title>${DEMO_TEXT.title}</title><style>\${css}</style></head>
<body><main class="courier-demo"><h1>${DEMO_TEXT.title}</h1><p>${DEMO_TEXT.lead}</p>\${body}</main></body>
</html>\`;
}

/** The email a new user gets, from their name. */
export function emailOf(name: string): string {
  return \`\${name.trim().toLowerCase().replace(/\\s+/g, ".")}@example.com\`;
}

/** What a call that failed threw, as an error the page can show. */
export function failure(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
`;
  return [
    { path: callerPath, content: caller, purpose: "your API's client for server code" },
    { path: pagePath, content: page, purpose: "the page that shows Courier at work" },
  ];
}
