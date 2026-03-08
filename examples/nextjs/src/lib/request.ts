import { createClientRequest } from "@noverax/nexus";
import type { MethodsType } from "@/api";

export const request = createClientRequest<MethodsType>();
