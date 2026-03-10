import { createQueryCaller } from "@noverax/nexus-query"
import type { Sources } from "@/api"

const q = createQueryCaller<Sources>()

export const { useQuery, useMutation, useSuspenseQuery, caller } = q
