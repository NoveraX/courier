/**
 * @vitest-environment jsdom
 *
 * Endpoints in no group — an operation with no tag, a request at a
 * collection's root — are the API's own, called as `client.health()`. The
 * import wizard and Manage list them as the top level, not as a group with
 * no name, and name each endpoint as a client reaches it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EndpointInventory, ParsedEndpoint, ParsedSpec } from "@/features/apis/types";
import { SelectEndpointsStep } from "@/screens/apis/import/select-endpoints-step";
import { InventoryStep } from "@/screens/apis/manage/inventory-step";

afterEach(cleanup);

const endpoint = (name: string, path: string): ParsedEndpoint =>
  ({
    name,
    operationId: name,
    httpMethod: "get",
    path,
    fullPath: path,
    description: "",
    secured: false,
    requestBody: null,
    parameters: [],
    responseSchema: null,
    tags: [],
  }) as ParsedEndpoint;

const SPEC: ParsedSpec = {
  title: "Pets",
  version: "1",
  description: "",
  baseURL: "https://pets.example",
  format: "openapi3",
  groups: [
    { name: "", description: "", prefix: "", endpoints: [endpoint("health", "/health")] },
    { name: "pets", description: "", prefix: "/pets", endpoints: [endpoint("list", "")] },
  ],
  schemas: {},
  securitySchemes: [],
  skipped: [],
};

describe("the import wizard's endpoint list", () => {
  it("lists the API's own endpoints as the top level, and counts only the groups", () => {
    render(
      <SelectEndpointsStep
        spec={SPEC}
        selected={{ "": ["health"], pets: ["list"] }}
        onToggleEndpoint={() => {}}
        onToggleGroup={() => {}}
        onToggleAll={() => {}}
      />,
    );

    expect(screen.getByRole("region", { name: "Top-level endpoints" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Group pets" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select Top level" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select health" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select pets.list" })).toBeTruthy();
    expect(screen.getByText(/2 operations · 1 group$/)).toBeTruthy();
  });
});

describe("Manage's endpoint list", () => {
  it("lists the import's own endpoints as the top level", () => {
    const inventory: EndpointInventory = {
      groups: [
        {
          name: "",
          prefix: "",
          isCustomGroup: false,
          endpoints: [
            { group: "", name: "health", httpMethod: "GET", path: "/health", status: "active" },
          ],
        },
      ],
      specChanged: false,
      totalActive: 1,
      totalAvailable: 0,
      totalCustom: 0,
    };

    render(
      <InventoryStep
        inventory={inventory}
        toAdd={{}}
        toRemove={{}}
        onToggle={() => {}}
        onToggleGroup={() => {}}
        onToggleAll={() => {}}
      />,
    );

    expect(screen.getByRole("region", { name: "Top-level endpoints" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Keep Top level" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Keep health" })).toBeTruthy();
  });
});
