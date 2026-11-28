/**
 * A call kept within its API's origin, in a React Native app.
 *
 * `withinOrigin` keeps the credentials a call carries on the origin it was
 * sent to: a redirect there is followed, and one anywhere else is answered
 * with as it came. Courier keeps a call so by sending it with `redirect:
 * "manual"` and following each redirect itself. React Native's networking
 * follows every redirect, whatever a request says — its XMLHttpRequest, and
 * React Native's own fetch, the whatwg-fetch polyfill built on it, which
 * drops `redirect` — and on Android, as OkHttp does here, takes every header
 * the call carries but `Authorization` on to the host the API named. Of an
 * app's fetches, expo/fetch alone hands a redirect over when told to. A
 * call that reported its progress went through XMLHttpRequest, and every
 * call under React Native's own fetch went with it: the API's key reached
 * the other host, and that host's answer was read as the API's.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { PlatformFetch } from "../src/http-client/source-transport";
import { type AppFetch, asReactNative, ExpoFormData } from "./helpers/react-native";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const KEY = { "x-api-key": "key-of-the-api" };
const GREETING = { text: "Hello, café — naïve ✓" };
const UNAVAILABLE = { name: "ConfigurationError", code: "WITHIN_ORIGIN_UNAVAILABLE" };
let api: Upstream | undefined;
let elsewhere: Upstream | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  await api?.close();
  await elsewhere?.close();
  api = elsewhere = undefined;
});

function source(baseURL: string, fetch?: PlatformFetch) {
  return defineApi({
    baseURL,
    headers: KEY,
    ...(fetch && { fetch }),
    endpoints: {
      greeting: endpoint.get("greeting").response<typeof GREETING>(),
      upload: endpoint.post("upload").variables<unknown>().response<unknown>(),
    },
  });
}

/* A host of another origin, which answers whatever reaches it. */
async function anotherHost(): Promise<Upstream> {
  return startUpstream((_request, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "an answer from elsewhere" }));
  });
}

/* The API: it sends every call on to `target` with a redirect of `status`, and answers the one
   that reaches `/moved` with the greeting. */
async function redirectingTo(target: string, status = 302): Promise<Upstream> {
  return startUpstream((request, res) => {
    if (request.url === "/moved") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(GREETING));
      return;
    }
    res.writeHead(status, { location: target });
    res.end();
  });
}

describe("a call kept within its origin, in an app whose fetch is expo/fetch", () => {
  it("follows a redirect on the API's origin", async () => {
    api = await redirectingTo("/moved");
    asReactNative("expo");

    const greeting = await createCaller(source(api.url)).greeting.with({ withinOrigin: true })();

    expect(greeting).toEqual(GREETING);
    expect(api.received.map(({ url }) => url)).toEqual(["/greeting", "/moved"]);
  });

  it("stops at a redirect to another origin, which receives nothing", async () => {
    elsewhere = await anotherHost();
    api = await redirectingTo(`${elsewhere.url}/taken`);
    asReactNative("expo");

    const call = createCaller(source(api.url)).greeting.with({ withinOrigin: true })();

    await expect(call).rejects.toMatchObject({ name: "HTTPError", status: 302 });
    expect(elsewhere.received).toEqual([]);
  });

  it("stops there as it reports its download, with expo/fetch rather than XMLHttpRequest", async () => {
    elsewhere = await anotherHost();
    api = await redirectingTo(`${elsewhere.url}/taken`);
    asReactNative("expo");

    const call = createCaller(source(api.url)).greeting.with({
      withinOrigin: true,
      onDownloadProgress: () => undefined,
    })();

    await expect(call).rejects.toMatchObject({ name: "HTTPError", status: 302 });
    expect(elsewhere.received).toEqual([]);
  });

  it("stops there as it reports its upload, with expo/fetch rather than XMLHttpRequest", async () => {
    elsewhere = await anotherHost();
    api = await redirectingTo(`${elsewhere.url}/taken`, 307);
    asReactNative("expo");

    const call = createCaller(source(api.url)).upload.with({
      withinOrigin: true,
      onUploadProgress: () => undefined,
    })("a body of its own — café ✓");

    await expect(call).rejects.toMatchObject({ name: "HTTPError", status: 307 });
    expect(elsewhere.received).toEqual([]);
  });

  it("refuses a form naming a file on the device, which XMLHttpRequest alone sends, before it is sent", async () => {
    elsewhere = await anotherHost();
    api = await redirectingTo(`${elsewhere.url}/taken`, 307);
    asReactNative("expo");
    vi.stubGlobal("FormData", ExpoFormData);
    const form = new ExpoFormData();
    form.append("photo", { uri: "file:///café.jpg", name: "café.jpg", type: "image/jpeg" });

    const call = createCaller(source(api.url)).upload.with({ withinOrigin: true })(form);

    await expect(call).rejects.toMatchObject(UNAVAILABLE);
    expect(api.received).toEqual([]);
    expect(elsewhere.received).toEqual([]);
  });
});

describe.each<AppFetch>(["react-native", "expo-with-react-native-fetch"])(
  "a call kept within its origin, in an app whose fetch is %s's",
  (fetch) => {
    it("is refused before it is sent, as that fetch follows every redirect itself", async () => {
      elsewhere = await anotherHost();
      api = await redirectingTo(`${elsewhere.url}/taken`);
      asReactNative(fetch);

      const call = createCaller(source(api.url)).greeting.with({ withinOrigin: true })();

      await expect(call).rejects.toMatchObject(UNAVAILABLE);
      expect(api.received).toEqual([]);
      expect(elsewhere.received).toEqual([]);
    });
  },
);

describe("a call kept within its origin through an app's own fetch that sends with React Native's", () => {
  /* Signs each request, as an app's own fetch may, and sends it with the app's fetch. */
  const signing: PlatformFetch = (url, init) => {
    const headers = new Headers(init.headers);
    headers.set("x-signature", "signed");
    return globalThis.fetch(url, { ...init, headers });
  };

  it("is refused once that fetch brings an answer from another origin, rather than read as the API's", async () => {
    elsewhere = await anotherHost();
    api = await redirectingTo(`${elsewhere.url}/taken`);
    asReactNative("react-native");

    const call = createCaller(source(api.url, signing)).greeting.with({ withinOrigin: true })();

    await expect(call).rejects.toMatchObject(UNAVAILABLE);
    /* The redirect was followed before any answer came back: nothing in the app can stop that. */
    expect(elsewhere.received).toHaveLength(1);
  });

  it("takes an answer that fetch followed a redirect to on the API's origin", async () => {
    api = await redirectingTo("/moved");
    asReactNative("react-native");

    const call = createCaller(source(api.url, signing)).greeting.with({ withinOrigin: true });

    expect(await call()).toEqual(GREETING);
  });
});
