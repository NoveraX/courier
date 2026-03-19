import { z } from "zod";

import type { Settings } from "@/store/types";

// ── Zod schema matching the store Settings interface ─────────────────────────

export const settingsSchema: z.ZodType<Settings> = z.object({
  theme: z.enum(["dark", "light", "system"]),
  density: z.enum(["comfortable", "compact"]),
  maxRequests: z.number().min(50).max(10000),
  preserveLog: z.boolean(),
  ignorePatterns: z.array(z.string()),
  timestampFormat: z.enum(["relative", "absolute"]),
  jsonIndent: z.union([z.literal(2), z.literal(4)]),
  showRequestPreview: z.boolean(),
  toastOnError: z.boolean(),
  toastOnSlowRequest: z.boolean(),
  slowRequestThreshold: z.number().min(100).max(30000),
  autoReconnect: z.boolean(),
  reconnectDelay: z.number().min(500).max(30000),
  defaultExportFormat: z.enum(["har", "json", "postman"]),
  apisValidation: z.enum(["zod", "valibot", "arktype", "none"]),
  apisGroupBy: z.enum(["tag", "path", "single"]),
  apisGenerateTypes: z.boolean(),
  apisGenerateSchemas: z.boolean(),
  apisIncludeComments: z.boolean(),
  apisClient: z.enum(["direct", "proxy", "both", "none"]),
});
