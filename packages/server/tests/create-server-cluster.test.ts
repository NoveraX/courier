/**
 * The standalone server hands its WebSocket handler the cluster's secret,
 * which signs the commands its connections registry sends the other
 * replicas: one too short to sign with is refused as the server is made,
 * before it listens.
 */
import { ConfigurationError } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createCourierServer } from "../src/create-server";

describe("createCourierServer({ cluster })", () => {
  it("refuses a cluster secret shorter than 32 bytes before it listens", () => {
    const api = defineApi({ baseURL: "https://upstream.example", endpoints: {} });

    expect(() =>
      createCourierServer({
        sources: { api },
        port: 0,
        signals: false,
        cluster: { secret: "too-short" },
      }),
    ).toThrow(ConfigurationError);
  });
});
