import { describe, expect, it } from "vitest";

import { LONGEST_ROUTE_PATH } from "../src/server/canonical-route";
import { OPEN_ROUTES, requiresToken } from "../src/server/token-guard";
import { filesRegisteringUnreadRoutes, registeredApiRoutes } from "./helpers/api-routes";

describe("requiresToken", () => {
  it("asks for the token on a route that changes something, however it is spelled", () => {
    for (const path of [
      "/api/sessions/save",
      "/api/sessions/save/",
      "/API/Sessions/Save",
      "/api//sessions/save",
      "/api/sessions/%73ave",
      "/api/x/../sessions/save",
      "/x/..%2Fapi/sessions/save",
      "/api%2Fsessions%2Fsave",
    ]) {
      expect(requiresToken(path)).toBe(true);
    }
  });

  it("asks for it on the routes that read past what Studio shows", () => {
    for (const path of [
      "/api/apis/declare/preview",
      "/api/mocks/declare/preview",
      "/api/apis/imports/remove/preview",
      "/api/apis/imports/check-updates",
      "/api/apis/imports/check-all",
      "/api/apis/manage/inventory",
      "/api/apis/manage/preview",
      "/api/apis/update/preview",
      "/api/editor/sites",
      "/api/editor/definitions",
      "/api/editor/groups",
    ]) {
      expect(requiresToken(path)).toBe(true);
    }
  });

  it("asks for it on an API route no list names", () => {
    expect(requiresToken("/api/a-route-added-later")).toBe(true);
    expect(requiresToken("/api")).toBe(true);
  });

  it("opens a route only to the path that names it as written", () => {
    expect(requiresToken("/api/sessions/list")).toBe(false);
    for (const path of [
      "/api/sessions/list/",
      "/API/sessions/list",
      "/api/Sessions/list",
      "/api//sessions/list",
      "/api/sessions/%6cist",
      "/api/./sessions/list",
      "/api/sessions/list/.",
      "/x/../api/sessions/list",
    ]) {
      expect(requiresToken(path)).toBe(true);
    }
  });

  it("asks for it on a path that climbs out of the API within a segment", () => {
    for (const path of [
      "/api/sessions/..%2F..%2Fx/delete",
      "/api/sessions/..%5C..%5Cx/delete",
      "/api/sessions/%2E%2E%2F%2E%2E%2Fx/delete",
      "/api/files/..%2F..%2Fhealth",
      "/api/files/../../health",
    ]) {
      expect(requiresToken(path)).toBe(true);
    }
  });

  it("asks for it on a path it cannot read within bounds, in or out of the API", () => {
    expect(requiresToken(`/%${"25".repeat(8)}61`)).toBe(true);
    expect(requiresToken(`/assets/%${"25".repeat(3)}61.js`)).toBe(true);
    expect(requiresToken(`/${"a".repeat(LONGEST_ROUTE_PATH)}`)).toBe(true);
    expect(requiresToken(`/%25${"25".repeat(32 * 1024)}61`)).toBe(true);
  });

  it("asks for nothing on a route that reads what Studio shows, or outside the API", () => {
    expect(requiresToken("/api/sessions/list")).toBe(false);
    expect(requiresToken("/api/apis/parse")).toBe(false);
    expect(requiresToken("/api/apis/generate")).toBe(false);
    expect(requiresToken("/explorer")).toBe(false);
    expect(requiresToken("/assets/index.js")).toBe(false);
    expect(requiresToken("/apis/write")).toBe(false);
    expect(requiresToken("/sessions/100%25")).toBe(false);
    expect(requiresToken("/apiary/sessions/save")).toBe(false);
  });
});

describe("the open routes", () => {
  it("are each a route Studio registers", () => {
    const registered = new Set(registeredApiRoutes());

    expect([...OPEN_ROUTES].filter((route) => !registered.has(route))).toEqual([]);
  });

  it("leave every route that writes asking for the token", () => {
    const writing = registeredApiRoutes().filter((route) =>
      /\/(write|apply|save|load|delete|import|remove|clear|compact|forget|undo|deliver|scenario|conditions|plan)$/.test(
        route,
      ),
    );

    expect(writing.length).toBeGreaterThan(15);
    expect(writing.filter((route) => !requiresToken(route))).toEqual([]);
  });
});

describe("the API's routes", () => {
  /* The guard opens a route to the one path that spells it. A parameter or a
     wildcard takes in paths its route does not spell — `..%2F` inside a
     segment, which the guard reads as a climb out of the API and Express
     binds as the parameter — so no API route has one. */
  it("are each registered by a path as written, with no parameter or wildcard", () => {
    const routes = registeredApiRoutes();

    expect(routes.length).toBeGreaterThan(40);
    expect(filesRegisteringUnreadRoutes()).toEqual([]);
    expect(routes.filter((route) => /[:*{}()]/.test(route))).toEqual([]);
  });
});
