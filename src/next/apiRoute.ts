import { type NextRequest, NextResponse } from "next/server";

import type { Sources } from "../direct/types";
import { executeRequest } from "../utils/createRequest";
import type { RequestPayloadInput } from "../utils/helpers";

export const apiRoute = (sources: Sources) => {
  const POST = async (request: NextRequest) => {
    const origin = request.headers.get("origin");

    if (!origin || new URL(request.url).origin !== origin) {
      return NextResponse.json({ success: false, message: "Origin mismatch" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type");

    let body: RequestPayloadInput;

    if (contentType?.includes("multipart/form-data")) {
      body = await request.formData();
    } else if (contentType?.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { success: false, message: "Unsupported Content-Type" },
        { status: 415 },
      );
    }

    return executeRequest(sources, body, {
      req: request,
      res: new NextResponse(),
    });
  };

  return { POST };
};
