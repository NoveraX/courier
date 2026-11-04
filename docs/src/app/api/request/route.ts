import { registerSources } from "@noverax/courier"
import { apiRoute } from "@noverax/courier-next"
import { sources } from "@/api"

import { EXAMPLES_PROXY } from "./examples-proxy"

registerSources(sources)
export const { GET, POST } = apiRoute(EXAMPLES_PROXY)
