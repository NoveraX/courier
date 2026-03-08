import type { MethodsType } from "@/api";
import { createQueryRequest } from "@noverax/nexus/query";

export const { useQuery, useMutation, request } = createQueryRequest<MethodsType>();
