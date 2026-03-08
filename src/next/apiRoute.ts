import { type NextRequest, NextResponse } from "next/server";

import createRequest from "../utils/createRequest";

export const apiRoute = (sources: Record<string, any>) => {
  const POST = async (request: NextRequest) => {
    const contentType = request.headers.get("content-type");

    const body = await (contentType?.includes("multipart/form-data")
      ? request.formData()
      : request.json());

    return createRequest(sources, body, {
      req: request,
      res: new NextResponse(),
    }) as Promise<Response>;
  };

  return { POST };
};

export default apiRoute;
