import { registerSources } from "@noverax/nexus"
import { apiRoute } from "@noverax/nexus-next"
import { sources } from "@/api"

registerSources(sources)
export const { GET, POST } = apiRoute()
