import { createFileRoute } from "@tanstack/solid-router";

import { getMe, rename, signIn } from "../lib/session";

export const Route = createFileRoute("/")({ loader: () => getMe(), component: Home });

function Home() {
  const user = Route.useLoaderData();
  return (
    <>
      <pre id="me">{JSON.stringify(user())}</pre>
      <form action={signIn.url} method="post">
        <button id="login" type="submit">
          Sign in
        </button>
      </form>
      <form action={rename.url} method="post">
        <button id="rename" type="submit">
          Rename
        </button>
      </form>
      <a id="logout" href="/logout">
        Sign out
      </a>
    </>
  );
}
