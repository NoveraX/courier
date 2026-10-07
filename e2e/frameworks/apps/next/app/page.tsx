import { Suspense } from "react";

import { login, rename } from "./actions";
import { Me } from "./me";

export default function Home() {
  return (
    <main>
      <Suspense fallback={<p>Loading</p>}>
        <Me id="me" />
      </Suspense>
      <form action={login}>
        <button id="login" type="submit">
          Sign in
        </button>
      </form>
      <form action={rename}>
        <input name="name" defaultValue="Ada Lovelace" />
        <button id="rename" type="submit">
          Rename
        </button>
      </form>
      <a id="logout" href="/logout">
        Sign out
      </a>
    </main>
  );
}
