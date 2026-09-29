import { describe, expect, it } from "vitest";
import { registerLayoutRoute } from "../src/server/layout-route";
import type { JsonResponse, RouteApp } from "../src/server/route-types";

interface Answer {
  status: number;
  body: unknown;
}

function ask(body: Record<string, unknown>): Answer {
  let handler: Parameters<RouteApp["post"]>[1] | undefined;
  registerLayoutRoute({
    post: (_path, registered) => {
      handler = registered;
    },
  });
  const answer: Answer = { status: 200, body: undefined };
  const res: JsonResponse = {
    status(code) {
      answer.status = code;
      return res;
    },
    json(data) {
      answer.body = data;
    },
  };
  void handler?.({ body }, res);
  return answer;
}

describe("POST /api/apis/layout", () => {
  it("answers the directory the import's files go into", () => {
    const answer = ask({ importName: "petStore", outputDir: "./src/api/" });

    expect(answer).toEqual({
      status: 200,
      body: {
        dir: "src/api/pet-store",
        sourceFile: "src/api/pet-store/source.ts",
        sourceBinding: "petStore",
      },
    });
  });

  it("answers 400 with the refused field for a directory outside the project", () => {
    const answer = ask({ importName: "pets", outputDir: "../lib" });

    expect(answer.status).toBe(400);
    expect(answer.body).toMatchObject({ field: "outputDir" });
  });

  it("answers 400 for a body that is not the expected strings", () => {
    expect(ask({ importName: "pets" }).status).toBe(400);
    expect(ask({ importName: "pets", outputDir: "src", sourceName: 3 }).status).toBe(400);
  });
});
