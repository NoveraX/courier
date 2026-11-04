/**
 * What the release checks before it tags anything: every package it
 * publishes has to reach npm through trusted publishing — the run's own
 * identity exchanged for a publish token, as `npm publish` does. A token
 * stands in for it only for a package npm does not have yet, whose first
 * version can name no trusted publisher: any other package npm does not
 * trust the run for stops the release before the tag, naming how to set it
 * up.
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

/* GitHub and npm as the check meets them: npm has the packages named, trusts
   the run for those named, and takes the token named. */
function services({ trusts = NAMES, has = NAMES, identity = 200, token = "npm-token" } = {}) {
  const asked = [];
  const fetch = async (url, init = {}) => {
    const href = String(url);
    asked.push({ href, init });
    if (href.startsWith("https://actions.example/")) {
      if (identity !== 200) return new Response("down", { status: identity });
      return Response.json({ value: identityToken(CLAIMS) });
    }
    if (href === "https://registry.npmjs.org/-/whoami") {
      return init.headers?.Authorization === `Bearer ${token}`
        ? Response.json({ username: "maintainer" })
        : Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (href.includes("/oidc/token/exchange/package/")) {
      const name = decodeURIComponent(href.split("/package/")[1] ?? "");
      if (trusts.includes(name)) return Response.json({ token: `publish-token-for-${name}` });
      return Response.json(
        { message: "No trusted publisher matches this workflow" },
        { status: 404 },
      );
    }
    const name = decodeURIComponent(new URL(href).pathname.slice(1));
    return has.includes(name)
      ? Response.json({ name, versions: {} })
      : Response.json({ error: "Not found" }, { status: 404 });
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
    const { fetch } = services({ trusts: ["@noverax/courier"], has: ["@noverax/courier"] });
    const env = { ...ACTIONS, NPM_TOKEN: "npm-token" };

    const { lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(lines.join("\n")).not.toContain("publish-token-for");
    expect(lines.join("\n")).not.toContain(identityToken(CLAIMS));
    expect(lines.join("\n")).not.toContain("npm-token");
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

  it("stops the release for the packages npm has, whatever token the environment holds", async () => {
    const { fetch, asked } = services({ trusts: [] });
    const env = { ...ACTIONS, NODE_AUTH_TOKEN: "npm-token", NPM_TOKEN: "npm-token" };

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(ok).toBe(false);
    expect(lines[0]).toBe(
      "::error::npm: 2 of 2 packages cannot be published through trusted publishing.",
    );
    expect(lines.filter((line) => line.includes("npm trust github"))).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("npm-token");
    expect(asked.map(({ href }) => href)).not.toContain("https://registry.npmjs.org/-/whoami");
  });

  it("lets a package npm does not have yet go with the environment's token, saying how to set it up after", async () => {
    const { fetch, asked } = services({ trusts: ["@noverax/courier"], has: ["@noverax/courier"] });
    const env = { ...ACTIONS, NPM_TOKEN: "npm-token" };

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(ok).toBe(true);
    expect(lines).toEqual([
      "::warning::npm: 1 of 2 packages are new to npm and publish their first version with the release environment's token.",
      "  @noverax/courier-next",
      "Then delete the token, from the environment and on npm, and set them up no more than two days before the next release:",
      "  npm trust github @noverax/courier-next --file ci.yml --repo NoveraX/courier --env release --allow-publish --yes",
      "  npm access set mfa=publish @noverax/courier-next",
    ]);
    expect(asked.slice(3).map(({ href }) => href)).toEqual([
      "https://registry.npmjs.org/@noverax%2fcourier-next",
      "https://registry.npmjs.org/-/whoami",
    ]);
    expect(asked[4].init.headers.Authorization).toBe("Bearer npm-token");
  });

  it("stops the release for a package npm does not have yet while the environment holds no token", async () => {
    const { fetch } = services({ trusts: ["@noverax/courier"], has: ["@noverax/courier"] });

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch }));

    expect(ok).toBe(false);
    expect(lines).toEqual([
      "::error::npm: 1 of 2 packages cannot be published through trusted publishing.",
      "  @noverax/courier-next: not on npm yet, and the `release` environment holds no npm token for its first version",
    ]);
  });

  it("stops the release for a package npm does not have yet when npm refuses the token", async () => {
    const { fetch } = services({
      trusts: ["@noverax/courier"],
      has: ["@noverax/courier"],
      token: "another-token",
    });
    const env = { ...ACTIONS, NPM_TOKEN: "npm-token" };

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(ok).toBe(false);
    expect(lines).toContain(
      "  @noverax/courier-next: not on npm yet, and npm refuses the token the `release` environment holds (401)",
    );
  });

  it("stops the release for a package npm has, though a new one beside it may go with the token", async () => {
    const { fetch } = services({ trusts: [], has: ["@noverax/courier"] });
    const env = { ...ACTIONS, NPM_TOKEN: "npm-token" };

    const { ok, lines } = await checkPublishing(NAMES, deps({ fetch, env }));

    expect(ok).toBe(false);
    expect(lines).toEqual([
      "::error::npm: 1 of 2 packages cannot be published through trusted publishing.",
      "  @noverax/courier: No trusted publisher matches this workflow",
      "Set them up:",
      "  npm trust github @noverax/courier --file ci.yml --repo NoveraX/courier --env release --allow-publish --yes",
      "  npm access set mfa=publish @noverax/courier",
    ]);
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

  it("hands the npm token the release environment may hold to the release step alone", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const workflows = readdirSync(".github/workflows").filter((file) => file.endsWith(".yml"));
    const lines = (file) => readFileSync(`.github/workflows/${file}`, "utf8").split("\n");
    const holding = workflows.flatMap((file) =>
      lines(file)
        .map((line, at) => ({ file, at, line: line.trim() }))
        .filter(({ line }) => /NPM_TOKEN|NODE_AUTH_TOKEN/.test(line) && !line.startsWith("#")),
    );
    const ci = lines("ci.yml");
    const step = ci.slice(0, holding[0]?.at).findLast((line) => line.trim().startsWith("- name:"));

    expect(holding.map(({ file, line }) => `${file}: ${line}`)).toEqual([
      expect.stringMatching(/^ci\.yml: NPM_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}$/),
    ]);
    expect(step?.trim()).toBe("- name: Release");
    expect(ci.indexOf("  release:")).toBeLessThan(holding[0].at);
  });
});
