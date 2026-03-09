import { type NextRequest, NextResponse } from "next/server";

import type { Sources } from "../direct/types";
import { executeRequest } from "../utils/createRequest";
import type { RequestPayloadInput } from "../utils/helpers";

const META_KEYS = new Set(["_s", "_g", "_m", "_o"]);

const errorJson = (status: number, message: string) =>
  NextResponse.json({ success: false, message }, { status });

export const apiRoute = (sources: Sources) => {
  const execute = (
    request: NextRequest,
    payload: RequestPayloadInput,
    proxyMethod: "GET" | "POST",
  ) => executeRequest(sources, payload, { req: request, res: new NextResponse(), proxyMethod });

  const GET = async (request: NextRequest) => {
    const url = new URL(request.url);
    const source = url.searchParams.get("_s");
    const group = url.searchParams.get("_g") || undefined;
    const method = url.searchParams.get("_m");

    if (!source || !method) {
      return errorJson(400, "Missing required params: _s, _m");
    }

    const variables: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (!META_KEYS.has(key)) {
        variables[key] = value;
      }
    }

    let options: Record<string, unknown> | undefined;
    const rawOptions = url.searchParams.get("_o");
    if (rawOptions) {
      try {
        options = JSON.parse(rawOptions, (key, value) => {
          if (key === "__proto__" || key === "constructor" || key === "prototype") {
            return undefined;
          }
          return value;
        });
      } catch {
        // options stays undefined
      }
    }

    return execute(
      request,
      {
        source,
        group,
        method,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
        options,
      },
      "GET",
    );
  };

  const POST = async (request: NextRequest) => {
    const origin = request.headers.get("origin");

    if (!origin || new URL(request.url).origin !== origin) {
      return errorJson(403, "Origin mismatch");
    }

    const contentType = request.headers.get("content-type");

    let body: RequestPayloadInput;

    if (contentType?.includes("multipart/form-data")) {
      body = await request.formData();
    } else if (contentType?.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return errorJson(400, "Invalid JSON body");
      }
    } else {
      return errorJson(415, "Unsupported Content-Type");
    }

    return execute(request, body, "POST");
  };

  return { GET, POST };
};
