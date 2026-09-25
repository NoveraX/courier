import { describe, expect, it } from "vitest";

import { specAddressKind } from "../src/server/spec-address-kind";

describe("specAddressKind", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.9.9.9", "loopback"],
    ["::1", "loopback"],
    ["0:0:0:0:0:0:0:1", "loopback"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:7f00:1", "loopback"],
  ])("takes %s for this machine", (address, kind) => {
    expect(specAddressKind(address)).toBe(kind);
  });

  it.each([
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::ffff:a9fe:a9fe",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::a00:1",
    "64:ff9b::a00:1",
    "64:ff9b:1::1",
    "2002:a00:1::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:0:a00:1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "3fff::1",
    "2001:2::1",
    "2001::1",
  ])("takes %s for a private network", (address) => {
    expect(specAddressKind(address)).toBe("private");
  });

  it.each(["0.0.0.0", "0.1.2.3", "::", "0:0:0:0:0:0:0:0", "::ffff:0.0.0.0", "::ffff:0:0", "::ffff:0:0:0"])(
    "takes %s for no destination, which reaches this machine's own services",
    (address) => {
      expect(specAddressKind(address)).toBe("unspecified");
    },
  );

  it.each(["8.8.8.8", "172.32.0.1", "1.1.1.1", "198.18.0.1", "2606:4700::1111", "64:ff9b::808:808", "2002:808:808::1"])(
    "takes %s for the public internet",
    (address) => {
      expect(specAddressKind(address)).toBe("public");
    },
  );
});
