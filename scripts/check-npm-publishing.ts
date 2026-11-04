/**
 * Run by the release before anything is tagged (semantic-release's
 * verifyConditions): can every package it publishes reach npm?
 *
 * With trusted publishing, each package names this repository's CI workflow
 * and its `release` environment as its publisher, and npm takes the run's
 * own short-lived identity in place of a token: nothing stored to leak or
 * rotate, and every version carries provenance. The check asks npm, for each
 * package, to exchange the run's identity for a publish token — as
 * `npm publish` itself does first — and throws away what it gets.
 *
 * npm sets a trusted publisher up only for a package it has, so a package
 * new to npm takes its first version from a token: the one the `release`
 * environment holds as `NPM_TOKEN` while it holds one, which the release
 * hands npm for such a package alone. A package npm does not trust the run
 * for stops the release here, before the tag, rather than halfway through
 * publishing — unless npm does not have it yet and takes that token — and
 * the run says which ones and how to set them up.
 *
 * Usage: tsx scripts/check-npm-publishing.ts
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packageDirs, publishOrder, readPkg } from "./release-order";

const REGISTRY = "https://registry.npmjs.org/";
/* The first npm that publishes through trusted publishing. */
const TRUSTED_NPM = [11, 5, 1] as const;

/** What the run is, to npm: the identity GitHub mints for it, and the claims npm matches. */
export interface RunIdentity {
  token: string;
  repository: string;
  workflowFile: string;
  environment: string | undefined;
}

/** The check's verdict, and what it prints. */
export interface PublishingCheck {
  ok: boolean;
  lines: string[];
}

/** Where the check reads the run and asks npm: real ones in the release, fakes in its tests. */
export interface CheckDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  npmVersion(): string;
}

/**
 * Check that npm trusts the run to publish every package, or takes the
 * environment's token for the first version of one it does not have yet.
 *
 * @param names - The packages the release publishes
 * @param deps - The run's environment, fetch and npm's version
 * @returns Whether the release may go on, and what to print
 * @example
 * ```ts
 * const { ok, lines } = await checkPublishing(["@noverax/courier"], realDeps);
 * ```
 */
export async function checkPublishing(
  names: readonly string[],
  deps: CheckDeps,
): Promise<PublishingCheck> {
  if (deps.env.GITHUB_ACTIONS !== "true") {
    return {
      ok: true,
      lines: [
        "npm: not on GitHub Actions, where the release job alone publishes; nothing to check.",
      ],
    };
  }
  const identity = await runIdentity(deps);
  const reasons = new Map<string, string>();
  for (const name of names) {
    const refused = identity.ok
      ? await exchangeRefused(name, identity.value, deps)
      : identity.reason;
    if (refused !== undefined) reasons.set(name, refused);
  }
  if (reasons.size === 0) {
    return {
      ok: true,
      lines: [`npm: all ${names.length} packages publish through trusted publishing.`],
    };
  }
  /* A package npm does not have yet can name no trusted publisher: its first
     version goes with the environment's token, if npm takes that. */
  const newPackages = identity.ok ? await notOnNpm([...reasons.keys()], deps) : [];
  const tokenRefusal = newPackages.length > 0 ? await tokenRefused(deps) : undefined;
  for (const name of newPackages) {
    if (tokenRefusal === undefined) reasons.delete(name);
    else reasons.set(name, `not on npm yet, ${tokenRefusal}`);
  }
  const run = identity.ok ? identity.value : undefined;
  if (reasons.size === 0) {
    return {
      ok: true,
      lines: [
        `::warning::npm: ${newPackages.length} of ${names.length} packages are new to npm and publish their first version with the release environment's token.`,
        ...newPackages.map((name) => `  ${name}`),
        "Then delete the token, from the environment and on npm, and set them up no more than two days before the next release:",
        ...setUpCommands(newPackages, run, deps.env),
      ],
    };
  }
  /* Only a package npm has can be set up: a new one waits for its first version. */
  const settable = [...reasons.keys()].filter((name) => !newPackages.includes(name));
  const list = [...reasons].map(([name, reason]) => `  ${name}: ${reason}`);
  return {
    ok: false,
    lines: [
      `::error::npm: ${reasons.size} of ${names.length} packages cannot be published through trusted publishing.`,
      ...list,
      ...(settable.length > 0 ? ["Set them up:", ...setUpCommands(settable, run, deps.env)] : []),
    ],
  };
}

type Outcome<TValue> = { ok: true; value: TValue } | { ok: false; reason: string };

/* The run's identity for npm, as GitHub mints it for a job with `id-token: write`. */
async function runIdentity({ env, fetch, npmVersion }: CheckDeps): Promise<Outcome<RunIdentity>> {
  const version = npmVersion();
  if (!atLeast(version, TRUSTED_NPM)) {
    return {
      ok: false,
      reason: `npm ${version} is older than ${TRUSTED_NPM.join(".")}, the first that publishes through trusted publishing`,
    };
  }
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return { ok: false, reason: "the job has no `id-token: write` permission" };
  const request = new URL(url);
  request.searchParams.append("audience", `npm:${new URL(REGISTRY).hostname}`);
  const response = await fetch(request, {
    headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
  });
  const body: unknown = response.ok ? await response.json() : undefined;
  const token = field(body, "value");
  if (typeof token !== "string")
    return { ok: false, reason: `GitHub gave the run no identity (${response.status})` };
  const claims = jwtClaims(token);
  const workflowRef = String(field(claims, "workflow_ref") ?? "");
  return {
    ok: true,
    value: {
      token,
      repository: String(field(claims, "repository") ?? ""),
      workflowFile: workflowRef.replace(/@.*$/, "").split("/").at(-1) ?? "",
      environment:
        typeof field(claims, "environment") === "string"
          ? String(field(claims, "environment"))
          : undefined,
    },
  };
}

/* Why npm will not let the run publish a package through trusted publishing, if it will not. */
async function exchangeRefused(
  name: string,
  identity: RunIdentity,
  { fetch }: CheckDeps,
): Promise<string | undefined> {
  const exchange = new URL(
    `-/npm/v1/oidc/token/exchange/package/${name.replaceAll("/", "%2f")}`,
    REGISTRY,
  );
  const response = await fetch(exchange, {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.token}` },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok && typeof field(body, "token") === "string") return undefined;
  const message = field(body, "message");
  return typeof message === "string" && message !== ""
    ? message
    : `npm answered ${response.status}`;
}

/* The packages npm has never seen: it answers 404 for their metadata. */
async function notOnNpm(names: readonly string[], { fetch }: CheckDeps): Promise<string[]> {
  const absent: string[] = [];
  for (const name of names) {
    const response = await fetch(new URL(name.replaceAll("/", "%2f"), REGISTRY), {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
    await response.body?.cancel();
    if (response.status === 404) absent.push(name);
  }
  return absent;
}

/* Why npm will not take the token the environment holds, if it will not: `npm whoami` with it. */
async function tokenRefused({ env, fetch }: CheckDeps): Promise<string | undefined> {
  const token = env.NPM_TOKEN;
  if (!token) return "and the `release` environment holds no npm token for its first version";
  const response = await fetch(new URL("-/whoami", REGISTRY), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  await response.body?.cancel();
  return response.ok
    ? undefined
    : `and npm refuses the token the \`release\` environment holds (${response.status})`;
}

/* The commands that name this run's workflow and environment as a package's
   trusted publisher, and have the package refuse tokens from then on. */
function setUpCommands(
  names: readonly string[],
  identity: RunIdentity | undefined,
  env: CheckDeps["env"],
): string[] {
  const repository = identity?.repository || env.GITHUB_REPOSITORY || "<owner>/<repository>";
  const file = identity?.workflowFile || "ci.yml";
  const environment = identity?.environment ?? "release";
  return names.flatMap((name) => [
    `  npm trust github ${name} --file ${file} --repo ${repository} --env ${environment} --allow-publish --yes`,
    `  npm access set mfa=publish ${name}`,
  ]);
}

function atLeast(version: string, least: readonly number[]): boolean {
  const parts = version.split(/[.+-]/).slice(0, 3).map(Number);
  for (const [index, wanted] of least.entries()) {
    const part = parts[index] ?? 0;
    if (part !== wanted) return part > wanted;
  }
  return true;
}

/* What a token GitHub minted says of the run: a JSON Web Token's middle part. */
function jwtClaims(token: string): unknown {
  const payload = token.split(".")[1];
  return payload === undefined
    ? undefined
    : JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

async function main(): Promise<void> {
  const names = publishOrder(packageDirs()).map((dir) => readPkg(dir).name);
  const { ok, lines } = await checkPublishing(names, {
    env: process.env,
    fetch,
    npmVersion: () => execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
  });
  for (const line of lines) (ok ? console.log : console.error)(line);
  if (!ok) process.exit(1);
}

/* Importing this module must not check anything: a test run is an import. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
