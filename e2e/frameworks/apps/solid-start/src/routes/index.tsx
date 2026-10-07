import { action, createAsync, query } from "@solidjs/router";

import { me, rename, signIn } from "~/lib/session";

const getMe = query(me, "me");
const login = action(signIn, "login");
const renameAction = action(rename, "rename");

export default function Home() {
  /* The page waits for it, so a session the API renews reaches the browser. */
  const user = createAsync(() => getMe(), { deferStream: true });
  return (
    <>
      <pre id="me">{JSON.stringify(user())}</pre>
      <form action={login} method="post">
        <button id="login" type="submit">
          Sign in
        </button>
      </form>
      <form action={renameAction} method="post">
        <button id="rename" type="submit">
          Rename
        </button>
      </form>
      <a id="logout" href="/logout" rel="external">
        Sign out
      </a>
    </>
  );
}
