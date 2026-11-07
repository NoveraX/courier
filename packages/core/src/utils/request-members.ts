/**
 * What a request the core builds names beside what it says itself, where
 * Node sends it: the members Node reads of the objects it builds of a
 * request's init, at the platform's own defaults. Node reads such a member of
 * `Object.prototype` where the init names none, though the init stands on no
 * prototype: a `referrer` found there it sends as the request's `Referer`, a
 * `mode` or a `window` refuses the request, and a `cache` or `credentials`
 * becomes the request's own. Named, each is the request's own. A request a
 * server builds itself as a `Request` names its `redirect` too; a call's own
 * leaves it unnamed where the call names none, as the core decides by it how
 * to follow one. Another platform reads its init alone, which stands on no
 * prototype, and refuses a member it does not implement — Cloudflare's
 * `mode` and `credentials` — so a request there names none, nor does a
 * page's, whose bundle takes a stand-in that names none.
 */
export const REQUEST_MEMBERS: RequestInit | undefined =
  globalThis.process?.versions?.undici === undefined
    ? undefined
    : {
        referrer: "about:client",
        referrerPolicy: "",
        mode: "cors",
        credentials: "same-origin",
        cache: "default",
        integrity: "",
        keepalive: false,
        window: null,
      };
