import { courier, defineApi } from "@noverax/courier/define";

import { startUpstream, type Upstream } from "../../../core/tests/helpers/upstream";

/** A real API that hands out its double-submit token at `csrf` and checks it on writes. */
export interface CsrfApi {
  readonly upstream: Upstream;
  readonly api: ReturnType<typeof csrfApi>;
}

function csrfApi(name: string, baseURL: string) {
  const { endpoint } = courier();
  return defineApi({
    name,
    baseURL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: `${name}_csrf`, header: "x-csrftoken", from: "csrf" },
    },
    endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
  });
}

/**
 * Start such an API on a free port.
 *
 * @param name - The API's name, which names its token's cookie and the token it hands out
 * @returns The API's server and its definition
 */
export async function startCsrfApi(name: string): Promise<CsrfApi> {
  const upstream = await startUpstream((request, res) => {
    if (request.url === "/csrf") res.setHeader("set-cookie", `${name}_csrf=t-${name}; Path=/`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  return { upstream, api: csrfApi(name, upstream.url) };
}
