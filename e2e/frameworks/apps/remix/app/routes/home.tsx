import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import { accounts } from "../accounts.server";

export async function loader() {
  return { me: await accounts.me() };
}

export async function action({ request }: { request: Request }) {
  if (new URL(request.url).searchParams.has("/login")) {
    await accounts.login({ user: "ada" });
    return redirect("/", { status: 303, headers: { "Set-Cookie": "signed_in=yes; Path=/" } });
  }
  await accounts.rename({ name: "Ada Lovelace" });
  return redirect("/", 303);
}

export default function Home() {
  const { me } = useLoaderData<typeof loader>();
  return (
    <>
      <pre id="me">{JSON.stringify(me)}</pre>
      <form method="post" action="/?/login">
        <button id="login" type="submit">
          Sign in
        </button>
      </form>
      <form method="post" action="/?/rename">
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
