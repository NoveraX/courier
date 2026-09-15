import { defineApi, defineGroup, courier } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

const { query } = courier();
import {
  BindingConflictError,
  BindingTable,
} from "../src/server/catalog/binding-table";

function makeConfig() {
  const usersGroup = defineGroup({
    prefix: "/users",
    endpoints: {
      list: query.response<unknown[]>().via((http) => http.get("")),
    },
  });
  const api = defineApi({
    name: "stripe",
    baseURL: "https://api.example.com",
    proxyPath: { http: "/api/request", sse: "/api/sse" },
    groups: { users: usersGroup },
  });
  return {
    sources: { stripe: api as never },
  };
}

describe("BindingTable.setConfig + getStatus", () => {
  it("derives expected pairs from proxyPath", () => {
    const table = new BindingTable();
    table.setConfig(makeConfig());
    const status = table.getStatus().sort((a, b) => a.transport.localeCompare(b.transport));
    expect(status).toHaveLength(2);
    expect(status[0]).toMatchObject({ sourceName: "stripe", transport: "http", status: "orphan" });
    expect(status[1]).toMatchObject({ sourceName: "stripe", transport: "sse", status: "orphan" });
  });
});

describe("BindingTable.attachRuntime / detachRuntime", () => {
  it("marks pairs as bound and resolves them", () => {
    const table = new BindingTable();
    table.setConfig(makeConfig());
    table.attachRuntime("next-server", ["http", "sse"], ["stripe"]);
    const binding = table.resolveBinding("stripe", "http");
    expect(binding).toEqual({ runtimeId: "next-server", sourceName: "stripe", transport: "http" });
    expect(table.getStatus().every((s) => s.status === "bound")).toBe(true);
  });

  it("detachRuntime returns pairs to orphan", () => {
    const table = new BindingTable();
    table.setConfig(makeConfig());
    table.attachRuntime("next-server", ["http", "sse"], ["stripe"]);
    table.detachRuntime("next-server");
    expect(table.resolveBinding("stripe", "http")).toBeNull();
    expect(table.getStatus().every((s) => s.status === "orphan")).toBe(true);
  });

  it("conflict status is reported when two runtimes claim the same pair", () => {
    const table = new BindingTable();
    table.setConfig(makeConfig());
    table.attachRuntime("next-server", ["http"], ["stripe"]);
    table.attachRuntime("hono-server", ["http"], ["stripe"]);
    const httpStatus = table.getStatus().find((s) => s.transport === "http");
    expect(httpStatus?.status).toBe("conflict");
    expect(httpStatus?.conflicting).toEqual(["next-server", "hono-server"]);
  });

  it("resolveBinding throws BindingConflictError on conflict", () => {
    const table = new BindingTable();
    table.setConfig(makeConfig());
    table.attachRuntime("a", ["http"], ["stripe"]);
    table.attachRuntime("b", ["http"], ["stripe"]);
    expect(() => table.resolveBinding("stripe", "http")).toThrow(BindingConflictError);
  });
});

describe("BindingTable.clear", () => {
  it("drops both expected pairs and claims", () => {
    const table = new BindingTable();
    table.setConfig(makeConfig());
    table.attachRuntime("a", ["http"], ["stripe"]);
    table.clear();
    expect(table.getStatus()).toEqual([]);
    expect(table.resolveBinding("stripe", "http")).toBeNull();
  });
});
