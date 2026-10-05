import { registerSources } from "@noverax/courier"
import { apiRoute } from "@noverax/courier-next"
import { sources } from "@/api"

registerSources(sources)
export const { GET, POST } = apiRoute()
