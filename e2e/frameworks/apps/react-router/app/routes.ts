import { type RouteConfig, route } from "@react-router/dev/routes";

/* The routes the SvelteKit application has, so one set of checks drives both. */
export default [
  route("/", "routes/home.tsx"),
  route("attack", "routes/attack.tsx"),
  route("attack-login", "routes/attack-login.tsx"),
  route("renew", "routes/renew.tsx"),
  route("logout", "routes/logout.tsx"),
  route("rename-route", "routes/rename-route.ts"),
] satisfies RouteConfig;
