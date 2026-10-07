import { useQueryClient } from "@noverax/courier-react";
import { useState } from "react";

import { anonymous, q } from "./query";

export function App() {
  const queryClient = useQueryClient();
  const me = q.account.useQuery("me");
  const signIn = q.auth.useMutation("signIn", { onSuccess: () => queryClient.invalidateQueries() });
  const rename = q.account.useMutation("rename");
  const signOut = q.auth.useMutation("signOut", { onSuccess: () => queryClient.resetQueries() });
  const [publicMe, setPublicMe] = useState("");

  return (
    <main>
      <pre id="me">{me.data ? JSON.stringify(me.data) : ""}</pre>
      <button id="sign-in" type="button" onClick={() => signIn.mutate({ user: "spa" })}>
        Sign in
      </button>
      <button id="rename" type="button" onClick={() => rename.mutate({ name: "Spa User" })}>
        Rename
      </button>
      <pre id="renamed">{rename.data ? JSON.stringify(rename.data) : ""}</pre>
      <button id="sign-out" type="button" onClick={() => signOut.mutate(undefined)}>
        Sign out
      </button>
      <button
        id="public"
        type="button"
        onClick={async () => setPublicMe(JSON.stringify(await anonymous.account.me()))}
      >
        Call the public API
      </button>
      <pre id="public-me">{publicMe}</pre>
    </main>
  );
}
