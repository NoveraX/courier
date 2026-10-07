import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { requestContext } from "@noverax/courier-fastify";
import Fastify from "fastify";

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
/* Fastify 4 and 5 take a redirect's arguments in another order; a status and a header read alike. */
const seeOther = (reply, location) => reply.code(303).header("location", location).send();

/* The routes the SvelteKit application has, so one set of checks drives both. */
const app = Fastify();
app.addHook("onRequest", requestContext());
/* A form post carries no field these routes read. */
app.addContentTypeParser("application/x-www-form-urlencoded", (_request, _body, done) =>
  done(null),
);
app.get("/", async (_request, reply) => {
  const me = await accounts.me();
  return reply.type("text/html").send(
    page(`<pre id="me">${escapeHtml(JSON.stringify(me))}</pre>
      <form method="post" action="/?/login"><button id="login">Sign in</button></form>
      <form method="post" action="/?/rename"><button id="rename">Rename</button></form>
      <a id="logout" href="/logout">Sign out</a>`),
  );
});
app.post("/", async (request, reply) => {
  if (request.url.endsWith("/login")) {
    await accounts.login({ user: "ada" });
    reply.header("set-cookie", "signed_in=yes; Path=/");
  } else await accounts.rename({ name: "Ada Lovelace" });
  return seeOther(reply, "/");
});
app.get("/attack", async (_request, reply) => {
  const written = await outcome(accounts.rename({ name: "Mallory" }));
  return reply.type("text/html").send(page(`<pre id="outcome">${written}</pre>`));
});
app.get("/attack-login", async (_request, reply) => {
  const written = await outcome(accounts.login({ user: "mallory" }));
  return reply.type("text/html").send(page(`<pre id="outcome">${written}</pre>`));
});
app.get("/renew", async (_request, reply) => {
  const first = await accounts.me();
  const second = await accounts.me();
  return reply
    .type("text/html")
    .send(page(`<pre id="renew">${escapeHtml(JSON.stringify({ first, second }))}</pre>`));
});
app.get("/logout", async (_request, reply) => {
  await accounts.logout();
  return seeOther(reply, "/");
});
app.post("/rename-route", async () => outcome(accounts.rename({ name: "Route" })));

const port = Number(process.env.PORT);
await app.listen({ port, host: "127.0.0.1" });
console.log(`Listening on http://127.0.0.1:${port}`);
