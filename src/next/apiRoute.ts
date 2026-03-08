import { type NextRequest, NextResponse } from "next/server";

import createRequest from "../utils/createRequest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiRoute = (sources: Record<string, any>) => {
  // eslint-disable-next-line const-case/uppercase
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
