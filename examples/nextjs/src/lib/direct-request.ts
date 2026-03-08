import { createDirectRequest } from "@noverax/nexus/direct"
import { methods } from "@/api"

export const directRequest = createDirectRequest(methods)
