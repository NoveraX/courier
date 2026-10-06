/**
 * Managing an import with a newer specification is an update: the
 * endpoints kept are generated from it afresh — their schemas follow it —
 * while the user's edits stay, the endpoints left out at import stay out,
 * the ones picked are added, and the ones the specification dropped go.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeSpecHash } from "../src/apis";
import { loadImportsState } from "../src/apis/imports-state";
import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const OK = (schema: unknown) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});
const INVOICE = { $ref: "#/components/schemas/Invoice" };

function billing(version: 1 | 2) {
  const invoice = {
    type: "object",
    required: ["id", "status"],
    properties: {
      id: { type: "string" },
      status: {
        type: "string",
        enum: version === 1 ? ["draft", "open"] : ["draft", "open", "void"],
      },
      ...(version === 2 && { dueDate: { type: "string" } }),
    },
  };
  const id = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];
  const paths: Record<string, unknown> = {
    "/invoices": {
      get: {
        operationId: "listInvoices",
        tags: ["invoices"],
        responses: OK({ type: "array", items: INVOICE }),
      },
    },
    "/invoices/{id}": {
      get: {
        operationId: "getInvoice",
        tags: ["invoices"],
        parameters: id,
        responses: OK(INVOICE),
      },
    },
  };
  if (version === 1) {
    paths["/customers"] = {
      get: {
        operationId: "listCustomers",
        tags: ["customers"],
        responses: OK({ type: "array", items: { type: "string" } }),
      },
    };
  } else {
    paths["/invoices/{id}/void"] = {
      post: {
        operationId: "voidInvoice",
        tags: ["invoices"],
        parameters: id,
        responses: OK(INVOICE),
      },
    };
  }
  return parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Billing", version: String(version) },
      paths,
      components: { schemas: { Invoice: invoice } },
    }),
  );
}

const CONFIG =
  'export default { sources: { api: { baseURL: "https://api.example" } }, imports: { billing: { importType: "file", type: "openapi", outputDir: "src/api" } } };\n';
const GROUP = "src/api/billing/invoices/index.ts";
/* listInvoices as the user edited it. */
const EDITED = "z.array(InvoiceSchema).max(100)";
const SCHEMAS = "src/api/billing/invoices/schemas.ts";

let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-manage-update-")));
  mkdirSync(dirname(join(root, "courier.config.ts")), { recursive: true });
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: unknown) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/* Billing imported from version 1 with getInvoice left out, then listInvoices edited by hand. */
async function imported(): Promise<string> {
  const url = await start();
  const written = await post(url, "/api/apis/write", {
    sourceName: "billing",
    spec: billing(1),
    options: {
      type: "openapi",
      outputDir: "src/api",
      sourceName: "billing",
      selectedEndpoints: { invoices: ["listInvoices"], customers: ["listCustomers"] },
    },
  });
  expect(written.status).toBe(200);
  writeFileSync(join(root, GROUP), read(GROUP).replace("z.array(InvoiceSchema)", EDITED));
  return url;
}

async function update(url: string, toAdd: Record<string, string[]>) {
  const body = { name: "billing", spec: billing(2), toAdd, toRemove: {} };
  const preview = await post(url, "/api/apis/manage/preview", body);
  const plan = preview.body.plan as { digest: string; pending: Array<{ path: string }> };
  const confirm = plan.pending.map((step) => step.path);
  return post(url, "/api/apis/manage/apply", { ...body, planDigest: plan.digest, confirm });
}

describe("managing an import with a newer specification", () => {
  it("generates the endpoints kept from it, so their schemas follow it", async () => {
    const url = await imported();

    const applied = await update(url, { invoices: ["voidInvoice"] });

    expect(applied.status).toBe(200);
    expect(read(SCHEMAS)).toContain("dueDate");
    expect(read(SCHEMAS)).toContain('"void"');
    expect(read(GROUP)).toContain("voidInvoice:");
  }, 30_000);

  it("keeps the user's edits, and the endpoints left out at import out", async () => {
    const url = await imported();

    await update(url, {});

    expect(read(GROUP)).toContain(EDITED);
    expect(read(GROUP)).not.toContain("getInvoice:");
    expect(read(GROUP)).not.toContain("voidInvoice:");
  }, 30_000);

  it("removes what the specification dropped, and records the specification it follows", async () => {
    const url = await imported();

    await update(url, {});

    expect(existsSync(join(root, "src/api/billing/customers/index.ts"))).toBe(false);
    expect(loadImportsState(root).imports.billing?.specHash).toBe(computeSpecHash(billing(2)));
  }, 30_000);
});
