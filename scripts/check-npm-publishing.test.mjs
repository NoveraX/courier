/**
 * What the release checks before it tags anything: every package it
 * publishes has to reach npm, through trusted publishing — the run's own
 * identity exchanged for a publish token, as `npm publish` does — or, while
 * a package has no trusted publisher, with a token npm accepts. A package
 * with neither stops the release before the tag, naming how to set it up.
 */
import { describe, expect, it } from "vitest";

import { checkPublishing } from "./check-npm-publishing.ts";

const NAMES = ["@noverax/courier", "@noverax/courier-next"];

/* A token GitHub would mint for the release job: header, claims, signature. */
function identityToken(claims) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const CLAIMS = {
  repository: "NoveraX/courier",
  workflow_ref: "NoveraX/courier/.github/workflows/ci.yml@refs/heads/master",
  environment: "release",
};

const ACTIONS = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "NoveraX/courier",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example/token?api-version=2.0",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
};

/* GitHub and npm as the check meets them: npm trusts the run for the packages named. */
function services({ trusts = NAMES, identity = 200 } = {}) {
  const asked = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    asked.push({ href, init });
    if (href.startsWith("https://actions.example/")) {
      if (identity !== 200) return new Response("down", { status: identity });
      return Response.json({ value: identityToken(CLAIMS) });
    }
    const name = decodeURIComponent(href.split("/package/")[1] ?? "");
    if (trusts.includes(name)) return Response.json({ token: `publish-token-for-${name}` });
    return Response.json(
      { message: "No trusted publisher matches this workflow" },
      { status: 404 },
    );
  };
  return { fetch, asked };
}

function deps({ env = ACTIONS, fetch, npm = "11.19.0", token = false } = {}) {
  let whoami = 0;
  return {
    deps: {
      env,
      fetch,
      npmVersion: () => npm,
      tokenAccepted: () => {
        whoami += 1;
        return token;
      },
    },
    whoami: () => whoami,
  };
}

describe("the release's npm check", () => {
  it("passes when npm trusts the run to publish every package, and asks for no token", async () => {
    const { fetch, asked } = services();
    const { deps: check, whoami } = deps({ fetch });

    const { ok, lines } = await checkPublishing(NAMES, check);

    expect(ok).toBe(true);
    expect(lines).toEqual(["npm: all 2 packages publish through trusted publishing."]);
    expect(whoami()).toBe(0);
    const identity = new URL(asked[0].href);
    expect(identity.searchParams.get("audience")).toBe("npm:registry.npmjs.org");
    expect(asked[0].init.headers.Authorization).toBe("Bearer request-token");
    expect(asked.slice(1).map(({ href }) => href)).toEqual([
      "https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@noverax%2fcourier",
      "https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@noverax%2fcourier-next",
    ]);
    expect(asked[1].init).toMatchObject({
      method: "POST",
      headers: { Authorization: `Bearer ${identityToken(CLAIMS)}` },
    });
  });

  it("prints no token it was given", async () => {
    const { fetch } = services();
    const { deps: check } = deps({ fetch });

    const { lines } = await checkPublishing(NAMES, check);

    expect(lines.join("\n")).not.toContain("publish-token-for");
    expect(lines.join("\n")).not.toContain(identityToken(CLAIMS));
  });

  it("lets a package with no trusted publisher go out with an accepted token, saying how to set it up", async () => {
    const { fetch } = services({ trusts: ["@noverax/courier"] });
    const { deps: check } = deps({
      fetch,
      env: { ...ACTIONS, NODE_AUTH_TOKEN: "npm-token" },
      token: true,
    });

    const { ok, lines } = await checkPublishing(NAMES, check);

    expect(ok).toBe(true);
    expect(lines[0]).toBe(
      "::warning::npm: 1 of 2 packages have no trusted publisher and publish with the release environment's token.",
    );
    expect(lines).toContain("  @noverax/courier-next: No trusted publisher matches this workflow");
    expect(lines).toContain(
      "  npm trust github @noverax/courier-next --file ci.yml --repo NoveraX/courier --env release --allow-publish --yes",
    );
  });

  it("stops the release when a package has no trusted publisher and no token npm accepts", async () => {
    const { fetch } = services({ trusts: [] });
    const { deps: check } = deps({ fetch, env: { ...ACTIONS, NODE_AUTH_TOKEN: "expired" } });

    const { ok, lines } = await checkPublishing(NAMES, check);

    expect(ok).toBe(false);
    expect(lines[0]).toBe(
      "::error::npm: 2 of 2 packages can be published neither through trusted publishing nor with a token npm accepts.",
    );
    expect(lines.filter((line) => line.includes("npm trust github"))).toHaveLength(2);
  });

  it("stops the release when the job has no identity to offer and no token", async () => {
    const { fetch, asked } = services();
    const { deps: check } = deps({
      fetch,
      env: { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "NoveraX/courier" },
    });

    const { ok, lines } = await checkPublishing(NAMES, check);

    expect(ok).toBe(false);
    expect(asked).toEqual([]);
    expect(lines).toContain("  @noverax/courier: the job has no `id-token: write` permission");
  });

  it("counts on no trusted publishing from an npm older than 11.5.1, which cannot use it", async () => {
    const { fetch, asked } = services();
    const { deps: check } = deps({
      fetch,
      npm: "10.9.2",
      env: { ...ACTIONS, NODE_AUTH_TOKEN: "npm-token" },
      token: true,
    });

    const { ok, lines } = await checkPublishing(NAMES, check);

    expect(ok).toBe(true);
    expect(asked).toEqual([]);
    expect(lines).toContain(
      "  @noverax/courier: npm 10.9.2 is older than 11.5.1, the first that publishes through trusted publishing",
    );
  });

  it("says GitHub gave the run no identity when it could not", async () => {
    const { fetch } = services({ identity: 503 });
    const { deps: check } = deps({ fetch });

    const { ok, lines } = await checkPublishing(NAMES, check);

    expect(ok).toBe(false);
    expect(lines).toContain("  @noverax/courier: GitHub gave the run no identity (503)");
  });

  it("checks nothing off GitHub Actions, where no release publishes", async () => {
    const { fetch, asked } = services();
    const { deps: check } = deps({ fetch, env: {} });

    const { ok } = await checkPublishing(NAMES, check);

    expect(ok).toBe(true);
    expect(asked).toEqual([]);
  });
});

describe("the release's configuration", () => {
  it("runs the check before anything is tagged, in place of npm whoami", async () => {
    const { readFileSync } = await import("node:fs");
    const config = JSON.parse(readFileSync(".releaserc.json", "utf8"));
    const exec = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/exec",
    );

    expect(exec[1].verifyConditionsCmd).toBe("npx tsx scripts/check-npm-publishing.ts");
  });
});
