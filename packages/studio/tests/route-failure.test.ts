import { CourierError } from "@noverax/courier";
import { PathOutsideProjectError } from "@noverax/courier-cli/devkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidImportError } from "../src/apis/layout";
import { ConfigLoaderError } from "../src/server/config-loader-errors";
import { ProjectUnavailableError } from "../src/server/project-state/project-unavailable-error";
import { sendRouteFailure } from "../src/server/route-failure";
import type { JsonResponse } from "../src/server/route-types";

function answered(err: unknown): { status: number; body: unknown } {
  const answer = { status: 0, body: undefined as unknown };
  const res: JsonResponse = {
    status(code) {
      answer.status = code;
      return res;
    },
    json(data) {
      answer.body = data;
    },
  };
  sendRouteFailure(res, err, "Failed");
  return answer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendRouteFailure", () => {
  it("answers a refused import declaration 400 with its code", () => {
    const answer = answered(new InvalidImportError("outputDir", "../lib", "it leaves the project"));

    expect(answer).toMatchObject({ status: 400, body: { code: "INVALID_IMPORT" } });
  });

  it("answers a path outside the project 400 with its code", () => {
    expect(answered(new PathOutsideProjectError("../a.ts", "it leaves the project"))).toMatchObject(
      {
        status: 400,
        body: { code: "PATH_OUTSIDE_PROJECT" },
      },
    );
  });

  it("answers a project that cannot serve the request with the status it names", () => {
    const err = ProjectUnavailableError.starting();

    expect(answered(err).status).toBe(err.httpStatus);
  });

  it("answers an edit refused because Studio is stopping 503, as no failure of the request", () => {
    const answer = answered(new ConfigLoaderError("CONFIG_WATCHER_STOPPED", "Studio is stopping"));

    expect(answer).toMatchObject({ status: 503, body: { code: "CONFIG_WATCHER_STOPPED" } });
  });

  it("answers anything else 500 and logs it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const answer = answered(new CourierError("broken", { code: "SOMETHING" }));

    expect(answer).toMatchObject({ status: 500, body: { error: "broken" } });
    expect(warn).toHaveBeenCalled();
  });
});
