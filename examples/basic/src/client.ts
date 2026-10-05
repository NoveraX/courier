import { createProxyCaller } from "@noverax/courier";

import type { api } from "./api";
import { boundary } from "./boundary";

/**
 * What a page calls. It imports the API as a type and the boundary as its
 * only value, so the upstream's address and paths never ship with it; the
 * boundary also says where the server's proxy routes are.
 */
export const caller = createProxyCaller<typeof api>("api", { boundary });
