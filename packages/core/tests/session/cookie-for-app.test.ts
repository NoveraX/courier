import { describe, expect, it } from "vitest";

import { cookieForApp } from "../../src/session/cookie-for-app";

describe("cookieForApp", () => {
  it("sets the API's cookie for every path of the application, secure over HTTPS", () => {
    const made = cookieForApp(
      { name: "sid", value: "a1", path: "/v1", httpOnly: true },
      "https://app.example.com",
    );

    expect(made).toEqual({
      cookie: { name: "sid", value: "a1", path: "/", httpOnly: true, secure: true },
    });
  });

  it("keeps a Domain that covers the application's host", () => {
    const made = cookieForApp(
      { name: "sid", value: "a1", domain: "example.com" },
      "https://app.example.com",
    );

    expect(made.cookie?.domain).toBe("example.com");
  });

  it("drops a Domain the application's host is outside of", () => {
    const made = cookieForApp(
      { name: "sid", value: "a1", domain: "api.example.net" },
      "https://app.example.com",
    );

    expect(made.cookie).not.toHaveProperty("domain");
  });

  it("drops a Domain when the application is reached by address", () => {
    const made = cookieForApp(
      { name: "sid", value: "a1", domain: "10.0.0.5" },
      "http://10.0.0.5:3000",
    );

    expect(made.cookie).not.toHaveProperty("domain");
  });

  it("keeps Secure on the local machine over plain HTTP, where browsers keep it", () => {
    expect(cookieForApp({ name: "sid", value: "a1" }, "http://localhost:3000").cookie?.secure).toBe(
      true,
    );
    expect(cookieForApp({ name: "sid", value: "a1" }, "http://127.0.0.1:3000").cookie?.secure).toBe(
      true,
    );
  });

  it("drops Secure, and what needs it, on a plain-HTTP origin elsewhere", () => {
    const made = cookieForApp(
      { name: "sid", value: "a1", secure: true, sameSite: "None", partitioned: true },
      "http://192.168.1.20:3000",
    );

    expect(made.cookie).toEqual({
      name: "sid",
      value: "a1",
      path: "/",
      secure: false,
      sameSite: "Lax",
    });
  });

  it("refuses a __Secure- or __Host- cookie the origin cannot keep", () => {
    const made = cookieForApp(
      { name: "__Host-sid", value: "a1", secure: true },
      "http://192.168.1.20:3000",
    );

    expect(made.refused).toContain("__Host-sid needs a secure origin");
  });

  it("keeps a __Host- cookie to its host, whatever Domain the API named", () => {
    const made = cookieForApp(
      { name: "__Host-sid", value: "a1", domain: "example.com", secure: true },
      "https://app.example.com",
    );

    expect(made.cookie).toEqual({ name: "__Host-sid", value: "a1", path: "/", secure: true });
  });

  it("keeps the cookie's own Secure when the application's origin is not known", () => {
    expect(cookieForApp({ name: "sid", value: "a1", secure: true }, undefined).cookie?.secure).toBe(
      true,
    );
    expect(cookieForApp({ name: "sid", value: "a1" }, undefined).cookie?.secure).toBe(false);
  });
});
