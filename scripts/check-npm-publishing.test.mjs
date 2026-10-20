/**
 * What the release checks before it tags anything: every package it
 * publishes has to reach npm through trusted publishing — the run's own
 * identity exchanged for a publish token, as `npm publish` does. No token
 * stands in for it: a package npm does not trust the run for stops the
 * release before the tag, naming how to set it up.
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

function deps({ env = ACTIONS, fetch, npm = "11.19.0" } = {}) {
  return { env, fetch, npmVersion: () => npm };
}

describe("the release's npm check", () => {
  it("passes when npm trusts the run to publish every package", async () => {
    const { fetch, asked } = services();

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch }));

    expect(ok).toBe(true);
    expect(lines).toEqual(["npm: all 2 packages publish through trusted publishing."]);
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

    const { lines } = await checkPublishing(NAMES, deps({ fetch }));

    expect(lines.join("\n")).not.toContain("publish-token-for");
    expect(lines.join("\n")).not.toContain(identityToken(CLAIMS));
  });

  it("stops the release when a package has no trusted publisher, saying how to set it up", async () => {
    const { fetch } = services({ trusts: ["@noverax/courier"] });

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch }));

    expect(ok).toBe(false);
    expect(lines[0]).toBe(
      "::error::npm: 1 of 2 packages cannot be published through trusted publishing.",
    );
    expect(lines).toContain("  @noverax/courier-next: No trusted publisher matches this workflow");
    expect(lines).toContain(
      "  npm trust github @noverax/courier-next --file ci.yml --repo NoveraX/courier --env release --allow-publish --yes",
    );
  });

  it("stops the release all the same when the environment holds an npm token", async () => {
    const { fetch } = services({ trusts: [] });
    const env = { ...ACTIONS, NODE_AUTH_TOKEN: "npm-token", NPM_TOKEN: "npm-token" };

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(ok).toBe(false);
    expect(lines[0]).toBe(
      "::error::npm: 2 of 2 packages cannot be published through trusted publishing.",
    );
    expect(lines.filter((line) => line.includes("npm trust github"))).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("npm-token");
  });

  it("stops the release when the job has no identity to offer", async () => {
    const { fetch, asked } = services();
    const env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "NoveraX/courier" };

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(ok).toBe(false);
    expect(asked).toEqual([]);
    expect(lines).toContain("  @noverax/courier: the job has no `id-token: write` permission");
  });

  it("stops the release on an npm older than 11.5.1, which cannot publish through trusted publishing", async () => {
    const { fetch, asked } = services();

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, npm: "10.9.2" }));

    expect(ok).toBe(false);
    expect(asked).toEqual([]);
    expect(lines).toContain(
      "  @noverax/courier: npm 10.9.2 is older than 11.5.1, the first that publishes through trusted publishing",
    );
  });

  it("says GitHub gave the run no identity when it could not", async () => {
    const { fetch } = services({ identity: 503 });

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch }));

    expect(ok).toBe(false);
    expect(lines).toContain("  @noverax/courier: GitHub gave the run no identity (503)");
  });

  it("checks nothing off GitHub Actions, where no release publishes", async () => {
    const { fetch, asked } = services();

    const { ok } = await checkPublishing(NAMES, deps({ fetch, env: {} }));

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

  it("gives no workflow an npm token to publish with", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const workflows = readdirSync(".github/workflows").filter((file) => file.endsWith(".yml"));
    const holding = workflows.filter((file) =>
      /NPM_TOKEN|NODE_AUTH_TOKEN/.test(readFileSync(`.github/workflows/${file}`, "utf8")),
    );

    expect(workflows).toContain("ci.yml");
    expect(holding).toEqual([]);
  });
});
