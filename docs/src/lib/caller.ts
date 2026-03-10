import { createCaller } from "@noverax/nexus"
import { sources } from "@/api"

export const call = createCaller(sources)
