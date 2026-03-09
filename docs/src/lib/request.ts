import { createQueryRequest } from "@noverax/nexus/query"
import type { MethodsType } from "@/api"

export const { useQuery, useMutation, request } = createQueryRequest<MethodsType>()
