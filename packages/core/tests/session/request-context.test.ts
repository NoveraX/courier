import { afterEach, describe, expect, it } from "vitest";

import type { IncomingRequest, RequestContextProvider } from "../../src/session/incoming-request";
import { captureIncomingRequest, registerRequestContext } from "../../src/session/request-context";

const removals: Array<() => void> = [];

function register(provider: RequestContextProvider): void {
  removals.push(registerRequestContext(provider));
}

function request(method: string): IncomingRequest {
  return { key: {}, method, headers: new Headers() };
}

afterEach(() => {
  for (const remove of removals.splice(0)) remove();
});

describe("captureIncomingRequest", () => {
  it("finds no request when no adapter is registered", () => {
    expect(captureIncomingRequest()).toBeUndefined();
  });

  it("asks the adapter registered last first", () => {
    const older = request("GET");
    const newer = request("POST");
    register(() => older);
    register(() => newer);

    expect(captureIncomingRequest()).toBe(newer);
  });

  it("asks the next adapter when one serves no request", () => {
    const served = request("GET");
    register(() => served);
    register(() => undefined);

    expect(captureIncomingRequest()).toBe(served);
  });

  it("asks every adapter synchronously, waiting only for the answers", async () => {
    const asked: string[] = [];
    const served = request("GET");
    register(() => {
      asked.push("sync");
      return served;
    });
    register(() => {
      asked.push("async");
      return Promise.resolve(undefined);
    });

    const found = captureIncomingRequest();

    expect(asked).toEqual(["async", "sync"]);
    await expect(found).resolves.toBe(served);
  });

  it("fails as the first answering adapter fails, the way a framework stops a render", async () => {
    const stop = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    register(() => Promise.resolve(request("GET")));
    register(() => Promise.reject(stop));

    await expect(captureIncomingRequest()).rejects.toBe(stop);
  });

  it("registers an adapter once however often it is registered", () => {
    const provider = () => request("GET");
    register(provider);
    register(provider);

    removals.pop()?.();

    expect(captureIncomingRequest()).toBeUndefined();
  });
});
