/**
 * The addresses the extension sends your files to: a Studio on this machine,
 * and no other host, whatever a project's files or settings name.
 */
import { describe, expect, it } from "vitest";

import { isLocalStudio } from "../src/studio/local-address";

describe("an address Studio may be asked at", () => {
  it("is localhost, a *.localhost name or a loopback address, over http or https", () => {
    for (const address of [
      "http://localhost:6280",
      "https://localhost:6280",
      "http://studio.localhost:6280",
      "http://127.0.0.1:6280",
      "http://127.4.5.6:6280",
      "http://[::1]:6280",
      "http://2130706433:6280",
    ]) {
      expect(isLocalStudio(address), address).toBe(true);
    }
  });

  it("is never another host, nor one with credentials or another scheme", () => {
    for (const address of [
      "https://collector.example",
      "http://localhost.collector.example:6280",
      "http://10.0.0.7:6280",
      "http://0.0.0.0:6280",
      "http://user:secret@localhost:6280",
      "ftp://localhost:6280",
      "file:///etc/passwd",
      "not an address",
    ]) {
      expect(isLocalStudio(address), address).toBe(false);
    }
  });
});
