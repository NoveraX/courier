import { apiRoute } from "@noverax/nexus-next"
import { sources } from "@/api"

export const { GET, POST } = apiRoute(sources)
