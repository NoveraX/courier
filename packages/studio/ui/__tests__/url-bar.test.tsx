/**
 * The Playground's URL bar: the method, the source's origin and the path,
 * the proxy route in proxy mode — and, for a stream or a channel the app
 * serves itself opened in direct mode, that it opens inside the app rather
 * than at an upstream it never calls.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProxyRoute } from "@/features/playground/proxy-route";
import type { UrlPart } from "@/features/playground/request-url";
import { UrlBar } from "@/screens/playground/url-bar";

const PARTS: UrlPart[] = [
  { text: "ws://127.0.0.1:4401", kind: "origin" },
  { text: "/live", kind: "path" },
];
const ROUTE: ProxyRoute = { display: "/ws", kind: "resolved", declared: true };

describe("the Playground's URL bar", () => {
  it("says a stream the app serves opens inside the app, not at the upstream, in direct mode", () => {
    const html = renderToStaticMarkup(<UrlBar label="WS" parts={PARTS} proxy={undefined} served />);

    expect(html).toContain("in your app");
    expect(html).not.toContain("ws://127.0.0.1:4401");
    expect(html).toContain("/live");
  });

  it("shows the route a served stream goes through in proxy mode", () => {
    const html = renderToStaticMarkup(<UrlBar label="WS" parts={PARTS} proxy={ROUTE} served />);

    expect(html).not.toContain("in your app");
    expect(html).toContain("via /ws");
  });

  it("warns in proxy mode that the proxy refuses an endpoint no mark opens, saying why", () => {
    const page = { exposed: false, reason: "expose: false on admin" };
    const html = renderToStaticMarkup(
      <UrlBar label="SSE" parts={PARTS} proxy={ROUTE} page={page} />,
    );

    expect(html).toContain("not exposed");
    expect(html).toContain(
      "Kept to the server: the proxy refuses a page&#x27;s call to it — expose: false on admin",
    );
  });

  it("says nothing of an endpoint a page may call", () => {
    const page = { exposed: true, reason: "marked .expose()" };
    const html = renderToStaticMarkup(
      <UrlBar label="SSE" parts={PARTS} proxy={ROUTE} page={page} />,
    );

    expect(html).not.toContain("not exposed");
  });

  it("shows the upstream for a stream the app calls", () => {
    const html = renderToStaticMarkup(<UrlBar label="SSE" parts={PARTS} proxy={undefined} />);

    expect(html).toContain("ws://127.0.0.1:4401");
    expect(html).not.toContain("in your app");
  });
});
