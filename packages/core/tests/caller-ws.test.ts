import { describe, expect, it } from "vitest";
import { buildDirectWSUrl, buildWSTopic } from "../src/realtime/caller-ws";

describe("buildDirectWSUrl", () => {
  it("converts http to ws and builds path", () => {
    expect(buildDirectWSUrl("http://localhost:3000", "chat", "room")).toBe(
      "ws://localhost:3000/chat/room",
    );
  });

  it("converts https to wss", () => {
    expect(buildDirectWSUrl("https://api.example.com", "notifications", "feed")).toBe(
      "wss://api.example.com/notifications/feed",
    );
  });

  it("strips trailing slash from baseURL", () => {
    expect(buildDirectWSUrl("http://localhost:3000/", "chat", "room")).toBe(
      "ws://localhost:3000/chat/room",
    );
  });

  it("handles empty prefix", () => {
    expect(buildDirectWSUrl("http://localhost:3000", "", "health")).toBe(
      "ws://localhost:3000/health",
    );
  });

  it("strips leading slash from prefix", () => {
    expect(buildDirectWSUrl("http://localhost:3000", "/chat", "room")).toBe(
      "ws://localhost:3000/chat/room",
    );
  });
});

describe("buildWSTopic", () => {
  it("builds topic with group", () => {
    expect(buildWSTopic("api", "chat", "room")).toBe("api.chat.room");
  });

  it("builds topic without group", () => {
    expect(buildWSTopic("api", "", "health")).toBe("api.health");
  });
});
