import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../src/errors/configuration-error";
import {
  assertSecureTransport,
  insecureTransport,
  isPrivateHost,
} from "../../src/session/transport";

describe("isPrivateHost", () => {
  it("knows the local machine, private ranges and cluster names", () => {
    const hosts = [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "[::1]",
      "10.1.2.3",
      "172.20.0.4",
      "192.168.0.9",
      "100.101.102.103",
      "api",
      "backend.default.svc",
      "api.default.svc.cluster.local",
      "printer.local",
      "db.internal",
      "fd00::1",
      "0.0.0.0",
    ];

    expect(hosts.filter((host) => !isPrivateHost(host))).toEqual([]);
  });

  it("knows public names and addresses", () => {
    const hosts = ["api.example.com", "8.8.8.8", "172.32.0.1", "100.128.0.1", "[2001:db8::1]"];

    expect(hosts.filter((host) => isPrivateHost(host))).toEqual([]);
  });
});

describe("insecureTransport", () => {
  it("lets a session travel over HTTPS anywhere", () => {
    expect(insecureTransport("https://api.example.com/v1")).toBeUndefined();
  });

  it("lets it travel over plain HTTP to a private host", () => {
    expect(insecureTransport("http://api:8080")).toBeUndefined();
    expect(insecureTransport("http://localhost:8000")).toBeUndefined();
  });

  it("refuses plain HTTP across the public internet", () => {
    expect(insecureTransport("http://api.example.com")).toContain(
      "plain HTTP across the public internet",
    );
  });

  it("leaves a path to the page's own origin", () => {
    expect(insecureTransport("/api")).toBeUndefined();
    expect(insecureTransport(undefined)).toBeUndefined();
  });
});

describe("assertSecureTransport", () => {
  it("throws SESSION_INSECURE_TRANSPORT naming the endpoint and the way out", () => {
    const send = () =>
      assertSecureTransport({ url: "http://api.example.com", name: "api.users.me" });

    expect(send).toThrow(ConfigurationError);
    expect(send).toThrow(/api\.users\.me: http:\/\/api\.example\.com .*session\.allowHttp/);
  });
});
