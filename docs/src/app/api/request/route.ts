import { registerSources } from "@noverax/courier/server"
import { apiRoute } from "@noverax/courier-next"
import { sources } from "@/api"
import { requestInspection } from "@/site/inspector/server/inspection"

import { EXAMPLES_PROXY } from "./examples-proxy"
import { inspectedRoute } from "./inspected-route"

registerSources(sources)
/* Each answer tells the live examples' page what the site's server saw of its call, unless the
   deployment switches the inspector off. */
export const { GET, POST } = inspectedRoute(
  apiRoute(EXAMPLES_PROXY),
  requestInspection(process.env)
)
