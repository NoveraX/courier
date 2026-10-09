import { majorOf } from "../../project/read-project";
import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT } from "./demo-parts";
import { DEMO_CSS, unreachableHint } from "./demo-style";

/**
 * `query.ts`: React Query hooks for the example API, typed from it. Through
 * the app's `/api/request` route with the boundary's list, so the API's
 * definition stays out of the browser's bundle — or, in an app without a
 * server, straight to the API.
 *
 * @param ctx - The project, and what is set up in it
 * @param dir - The folder Courier's own modules go in
 * @param through - `proxy` through the app's route, `direct` to the API
 * @returns The file
 * @example
 * ```ts
 * reactQuery(ctx, "src/courier", "proxy");
 * ```
 */
export function reactQuery(
  ctx: RecipeContext,
  dir: string,
  through: "proxy" | "direct",
): RecipeFile {
  const path = `${dir}/query.ts`;
  const api = importSpecifier(path, `${dir}/api.ts`, ctx.extension);
  const content =
    through === "proxy"
      ? `import { createProxyQueryCaller } from "@noverax/courier-react";

import type { api } from "${api}";
import { boundary } from "${importSpecifier(path, `${dir}/boundary.ts`, ctx.extension)}";

/** React Query hooks for your API, called through the app's /api/request route. */
export const q = createProxyQueryCaller<typeof api>("api", { boundary });
`
      : `import { createQueryCaller } from "@noverax/courier-react";

import { api } from "${api}";

/** React Query hooks for your API, which the browser calls directly. */
export const q = createQueryCaller(api);
`;
  return { path, content, purpose: "React Query hooks for your API" };
}

/** Where a React demo page goes, and how its module starts. */
export interface ReactDemoPlace {
  /** The page, relative to the root. */
  readonly path: string;
  /** The `query.ts` module, relative to the root. */
  readonly query: string;
  /** `"use client";` where the framework renders on the server first. */
  readonly directive: string;
  /** The environment variable the API's address is read from. */
  readonly variable: string;
}

/**
 * A page that shows Courier at work: the users the API answers with — from
 * the mock until the API's address names a backend — and a form that
 * creates one. It brings its own React Query client and its own styles, so
 * no file of the app changes for it.
 *
 * @param ctx - The project, and what is set up in it
 * @param place - Where it goes, and how it starts
 * @returns The page
 * @example
 * ```ts
 * reactDemo(ctx, { path: "src/app/courier/page.tsx", query: "src/courier/query.ts", directive: '"use client";\n\n', variable: "API_URL" });
 * ```
 */
export function reactDemo(ctx: RecipeContext, place: ReactDemoPlace): RecipeFile {
  const hint = unreachableHint(ctx.manager.run("studio"), place.variable);
  /* React 19 moves a <title> rendered anywhere into the document's head. */
  const title =
    (majorOf(ctx.project.version("react")) ?? 19) >= 19
      ? `\n        <title>${DEMO_TEXT.title}</title>`
      : "";
  const content = `${place.directive}import { QueryClient, QueryClientProvider } from "@noverax/courier-react";
import { type FormEvent, useState } from "react";

import { q } from "${importSpecifier(place.path, place.query, ctx.extension)}";

const css = \`${DEMO_CSS}\`;

/** Courier at work: your API's users, and a form that creates one. */
export default function CourierPage() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <main className="courier-demo">${title}
        <style>{css}</style>
        <h1>${DEMO_TEXT.title}</h1>
        <p>${DEMO_TEXT.lead}</p>
        <Users />
      </main>
    </QueryClientProvider>
  );
}

function Users() {
  const users = q.users.useQuery("list");
  const create = q.users.useMutation("create", { onSuccess: () => users.refetch() });
  const [name, setName] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    const email = \`\${name.trim().toLowerCase().replace(/\\s+/g, ".")}@example.com\`;
    create.mutate({ name, email }, { onSuccess: () => setName("") });
  }

  if (users.isPending) return <p>Loading users…</p>;
  if (users.error) {
    return (
      <p role="alert">
        Could not load users: {users.error.message}. ${hint}
      </p>
    );
  }
  return (
    <>
      <ul>
        {users.data.map((user) => (
          <li key={user.id}>
            {user.name} <small>{user.email}</small>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" required />
        <button type="submit" disabled={create.isPending}>
          Add user
        </button>
      </form>
    </>
  );
}
`;
  return { path: place.path, content, purpose: "a page that shows Courier at work" };
}
