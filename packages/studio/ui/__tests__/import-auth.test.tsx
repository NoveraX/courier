/**
 * @vitest-environment jsdom
 */
/**
 * A specification behind auth, imported from a URL: the wizard takes the
 * name of the environment variable that holds each credential, says
 * whether Studio's environment sets it, and sends Studio the names alone —
 * to read the specification, and to declare the import in courier.config.
 * An unfinished import keeps the names, and no value pasted in their place.
 * Manage reads a declared import by its name, never by an address the page
 * holds.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/studio-token", async (actual) => ({
  ...(await actual<typeof import("@/lib/studio-token")>()),
  studioToken: () => "t".repeat(43),
}));

import { importBody } from "@/apis/import-actions";
import { keptImport, readKeptImport, useKeptImport } from "@/apis/kept-import";
import { useImport } from "@/apis/use-import";
import { useInventoryLoaders } from "@/apis/use-manage-loaders";
import {
  type AuthDraft,
  authLacks,
  authRefsOf,
  NO_AUTH,
  variablesOf,
} from "@/features/apis/import-auth-draft";
import type { ParsedSpec } from "@/features/apis/types";
import { post } from "@/lib/api-client";
import { ImportAuthFields } from "@/screens/apis/import/import-auth-fields";

const SPEC_URL = "https://specs.example/orders.json";
const SPEC: ParsedSpec = {
  title: "Orders",
  version: "1",
  description: "",
  baseURL: "https://orders.example",
  format: "openapi3",
  groups: [],
  schemas: {},
  securitySchemes: [],
  skipped: [],
};

const BEARER: AuthDraft = { ...NO_AUTH, kind: "bearer", token: " ORDERS_SPEC_TOKEN " };

beforeEach(() => {
  useKeptImport.setState({ kept: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the auth the wizard reads with", () => {
  it("names a variable for each credential, and is none until each is named", () => {
    expect(authRefsOf(BEARER)).toEqual({ type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } });
    expect(authRefsOf({ ...NO_AUTH, kind: "bearer" })).toBeUndefined();
    expect(authLacks({ ...NO_AUTH, kind: "basic", username: "SPEC_USER" })).toBe(
      "Name the variables that hold the user and the password",
    );
    expect(authRefsOf(NO_AUTH)).toBeUndefined();
    expect(authLacks(NO_AUTH)).toBeNull();
  });

  it("sends the headers filled in, each its own, and none half filled", () => {
    const header: AuthDraft = {
      ...NO_AUTH,
      kind: "header",
      headers: [
        { name: "__proto__", variable: "ORDERS_API_KEY" },
        { name: "", variable: "" },
      ],
    };

    const auth = authRefsOf(header);

    expect(auth?.type === "header" && Object.hasOwn(auth.headers, "__proto__")).toBe(true);
    expect(variablesOf(header)).toEqual(["ORDERS_API_KEY"]);
    expect(authLacks({ ...header, headers: [{ name: "X-Api-Key", variable: "" }] })).not.toBeNull();
  });

  it("sends no name written otherwise than in capitals, a value pasted in its place", () => {
    const pasted: AuthDraft = { ...NO_AUTH, kind: "bearer", token: "sk_live_51HmadeUp9f2c" };

    expect(authLacks(pasted)).toContain("capitals, digits and _");
    expect(authRefsOf(pasted)).toBeUndefined();
    expect(authLacks({ ...NO_AUTH, kind: "bearer", token: "orders_spec_token" })).not.toBeNull();
  });
});

describe("an unfinished import behind auth", () => {
  it("keeps the variables' names, and not a value pasted in a name's place", () => {
    const pasted: AuthDraft = { ...NO_AUTH, kind: "bearer", token: "sk_live_51HmadeUp9f2c" };

    expect(keptImport("url", SPEC_URL, false, BEARER)?.auth).toMatchObject({
      kind: "bearer",
      token: "ORDERS_SPEC_TOKEN",
    });
    expect(keptImport("url", SPEC_URL, false, pasted)?.auth?.token).toBe("");
    expect(keptImport("raw", "openapi: 3.1.0", false, BEARER)).not.toHaveProperty("auth");
    expect(readKeptImport({ source: "url", content: SPEC_URL, auth: pasted })?.auth?.token).toBe(
      "",
    );
  });
});

describe("the wizard, for a specification behind auth", () => {
  it("has Studio read it, and declare it, with the variables named", async () => {
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (url === "/api/apis/parse") return SPEC;
      throw new Error(`unexpected request to ${url}`);
    });
    const { result } = renderHook(() => useImport());

    act(() => result.current.openWizard());
    act(() => result.current.setContent(SPEC_URL));
    act(() => result.current.setAuth(BEARER));
    await act(() => result.current.parse());

    const auth = { type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } };
    expect(post).toHaveBeenCalledWith("/api/apis/parse", {
      source: "url",
      content: SPEC_URL,
      auth,
    });
    expect(importBody(result.current.state)).toMatchObject({ specUrl: SPEC_URL, auth });
    expect(useKeptImport.getState().kept?.auth?.token).toBe("ORDERS_SPEC_TOKEN");
  });

  it("says whether Studio's environment sets each variable it names", async () => {
    vi.useFakeTimers();
    vi.mocked(post).mockResolvedValue({ variables: [{ name: "ORDERS_SPEC_TOKEN", set: false }] });

    render(<ImportAuthFields auth={BEARER} onChange={() => {}} />);
    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(post).toHaveBeenCalledWith("/api/apis/auth-variables", {
      names: ["ORDERS_SPEC_TOKEN"],
    });
    expect(screen.getByText("not set")).toBeTruthy();
  });
});

describe("Manage, for an import courier.config declares", () => {
  it("has Studio read the specification by the import's name", async () => {
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (url === "/api/apis/parse") return SPEC;
      return { groups: [] };
    });
    const deps = {
      setStep: vi.fn(),
      setError: vi.fn(),
      setInventory: vi.fn(),
      setSpec: vi.fn(),
    };
    const { result } = renderHook(() => useInventoryLoaders(deps));

    await act(() => result.current.fetchSpecAndLoadInventory("orders"));

    expect(post).toHaveBeenCalledWith("/api/apis/parse", { source: "import", content: "orders" });
  });
});
