import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, EMAIL_FROM_NAME, unreachableText } from "./demo-parts";
import { DEMO_CSS } from "./demo-style";

/**
 * A SolidStart page that shows Courier at work: the users the API answers
 * with — from the mock until VITE_API_URL names a backend — and a form
 * that creates one, called from the browser through the app's route.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - Where the page goes, relative to the root
 * @param caller - The `caller.ts` module, relative to the root
 * @returns The page
 * @example
 * ```ts
 * solidDemo(ctx, "src/routes/courier.tsx", "src/courier/caller.ts");
 * ```
 */
export function solidDemo(ctx: RecipeContext, path: string, caller: string): RecipeFile {
  /* SolidStart's templates name each page through @solidjs/meta. */
  const meta = ctx.project.lists("@solidjs/meta");
  const content = `${meta ? 'import { Title } from "@solidjs/meta";\n' : ""}import { createSignal, For, Match, onMount, Switch } from "solid-js";

import { courier } from "${importSpecifier(path, caller, ctx.extension)}";

type User = Awaited<ReturnType<typeof courier.users.list>>[number];

const css = \`${DEMO_CSS}\`;

/** Courier at work: your API's users, and a form that creates one. */
export default function CourierPage() {
  const [users, setUsers] = createSignal<User[]>();
  const [failure, setFailure] = createSignal<string>();
  const [name, setName] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  async function load() {
    try {
      setUsers(await courier.users.list());
      setFailure(undefined);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    setAdding(true);
    try {
      const value = name();
      await courier.users.create({ name: value, email: ${EMAIL_FROM_NAME.replaceAll("name.", "value.")} });
      setName("");
      await load();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  }

  onMount(load);

  return (
    <main class="courier-demo">${meta ? `\n      <Title>${DEMO_TEXT.title}</Title>` : ""}
      <style>{css}</style>
      <h1>${DEMO_TEXT.title}</h1>
      <p>${DEMO_TEXT.lead}</p>
      <Switch fallback={<p>${DEMO_TEXT.loading}</p>}>
        <Match when={failure()}>
          {(message) => (
            <p role="alert">
              Could not load users: {message()}. ${unreachableText(ctx, "VITE_API_URL")}
            </p>
          )}
        </Match>
        <Match when={users()}>
          {(list) => (
            <>
              <ul>
                <For each={list()}>
                  {(user) => (
                    <li>
                      {user.name} <small>{user.email}</small>
                    </li>
                  )}
                </For>
              </ul>
              <form onSubmit={add}>
                <input value={name()} onInput={(event) => setName(event.currentTarget.value)} placeholder="Name" required />
                <button type="submit" disabled={adding()}>
                  ${DEMO_TEXT.add}
                </button>
              </form>
            </>
          )}
        </Match>
      </Switch>
    </main>
  );
}
`;
  return { path, content, purpose: "a page that shows Courier at work" };
}
