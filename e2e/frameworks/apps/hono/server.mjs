import { serve } from "@hono/node-server";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { requestContext } from "@noverax/courier-hono/request-context";
import { Hono } from "hono";

import { API_URL } from "./api-url.mjs";

const { endpoint } = courier();
const accounts = createCaller(
  defineApi({
    name: "accounts",
    baseURL: API_URL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "csrf" },
    },
    forward: { requestId: true, userAgent: true, clientAddress: true },
    endpoints: {
      me: endpoint.get("me"),
      login: endpoint.post("login"),
      rename: endpoint.post("me/name"),
      logout: endpoint.post("logout", { session: "unguarded" }),
    },
  }),
);

const outcome = (call) =>
  call.then(
    () => "written",
    (error) => `refused ${error.status ?? "?"}`,
  );
const page = (body) => `<!doctype html><meta charset="utf-8"><body>${body}</body>`;
const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/* The routes the SvelteKit application has, so one set of checks drives both. */
const app = new Hono();
app.use(requestContext());
app.get("/", async (c) => {
  const me = await accounts.me();
  return c.html(
    page(`<pre id="me">${escapeHtml(JSON.stringify(me))}</pre>
      <form method="post" action="/?/login"><button id="login">Sign in</button></form>
      <form method="post" action="/?/rename"><button id="rename">Rename</button></form>
      <a id="logout" href="/logout">Sign out</a>`),
  );
});
app.post("/", async (c) => {
  if (c.req.url.endsWith("/login")) await accounts.login({ user: "ada" });
  else await accounts.rename({ name: "Ada Lovelace" });
  return c.redirect("/", 303);
});
app.get("/attack", async (c) =>
  c.html(page(`<pre id="outcome">${await outcome(accounts.rename({ name: "Mallory" }))}</pre>`)),
);
app.get("/attack-login", async (c) =>
  c.html(page(`<pre id="outcome">${await outcome(accounts.login({ user: "mallory" }))}</pre>`)),
);
app.get("/renew", async (c) => {
  const first = await accounts.me();
  const second = await accounts.me();
  return c.html(page(`<pre id="renew">${escapeHtml(JSON.stringify({ first, second }))}</pre>`));
});
app.get("/logout", async (c) => {
  await accounts.logout();
  return c.redirect("/", 303);
});
app.post("/rename-route", async (c) => c.text(await outcome(accounts.rename({ name: "Route" }))));

const port = Number(process.env.PORT);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () =>
  console.log(`Listening on http://127.0.0.1:${port}`),
);
