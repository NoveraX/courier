/**
 * The inventory reads each group of the specification with the group on
 * disk it is, renamed or not: its endpoints there are its own, active, so
 * an update through Manage keeps them. What the file under a renamed
 * group's name still holds of another group the specification dropped is
 * listed in that group, as gone from the specification, never as a second
 * group of the same name.
 */
import { describe, expect, it } from "vitest";

import { buildEndpointInventory } from "../../../src/apis/manage/build-inventory";
import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../../../src/apis/parser/types";

const DIR = "src/api/things";

function endpoint(name: string): ParsedEndpoint {
  return {
    name,
    operationId: name,
    httpMethod: "get",
    path: `/${name}`,
    fullPath: `/${name}`,
    description: "",
    secured: false,
    requestBody: null,
    parameters: [],
    responseSchema: null,
    tags: [],
  };
}

function specOf(groups: Record<string, string[]>): ParsedSpec {
  const parsed: ParsedGroup[] = Object.entries(groups).map(([name, endpoints]) => ({
    name,
    description: "",
    prefix: "/",
    endpoints: endpoints.map(endpoint),
  }));
  return {
    title: "Things",
    version: "2",
    description: "",
    baseURL: "/",
    format: "openapi3",
    groups: parsed,
    schemas: {},
    securitySchemes: [],
    skipped: [],
  };
}

const onDisk = (name: string, endpoints: string[]) => ({
  name,
  prefix: "/",
  endpoints,
  file: `${DIR}/${name}/index.ts`,
});

const statuses = (inventory: ReturnType<typeof buildEndpointInventory>) =>
  inventory.groups.map((group) => [
    group.name,
    group.endpoints.map((e) => `${e.name}=${e.status}`).join(" "),
  ]);

describe("buildEndpointInventory, groups renamed", () => {
  it("lists the endpoints of the file on disk as the renamed group's own", () => {
    const inventory = buildEndpointInventory(
      specOf({ undefinedGroup: ["makeThing"] }),
      [onDisk("undefined", ["makeThing"])],
      {},
      {},
    );

    expect(statuses(inventory)).toEqual([["undefinedGroup", "makeThing=active"]]);
  });

  it("lists a name that moved to another group's endpoints with those endpoints", () => {
    const inventory = buildEndpointInventory(
      specOf({ users: ["listUsers", "getUser"], group: ["getThing"] }),
      [onDisk("group", ["listUsers", "getUser"]), onDisk("group3", ["getThing"])],
      {},
      {},
    );

    expect(statuses(inventory)).toEqual([
      ["users", "listUsers=active getUser=active"],
      ["group", "getThing=active"],
    ]);
    expect(inventory.totalActive).toBe(3);
  });

  it("lists in the renamed group what its name's file holds of a group the specification dropped", () => {
    const file = `${DIR}/group/index.ts`;

    const inventory = buildEndpointInventory(
      specOf({ group: ["getThing"] }),
      [onDisk("group", ["listOld", "mine"]), onDisk("group3", ["getThing"])],
      { [file]: { listOld: "hash" } },
      {},
    );

    expect(statuses(inventory)).toEqual([
      ["group", "getThing=active listOld=removed-from-spec mine=custom"],
    ]);
    expect(inventory.groups[0]?.isCustomGroup).toBe(false);
  });

  it("lists a group on disk the specification no longer has under its own name", () => {
    const inventory = buildEndpointInventory(
      specOf({ pets: ["listPets"] }),
      [onDisk("pets", ["listPets"]), onDisk("store", ["mine"])],
      {},
      {},
    );

    expect(statuses(inventory)).toEqual([
      ["pets", "listPets=active"],
      ["store", "mine=custom"],
    ]);
    expect(inventory.groups[1]?.isCustomGroup).toBe(true);
  });
});
