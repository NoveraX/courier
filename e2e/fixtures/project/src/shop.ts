import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint } = courier();

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(["admin", "member", "viewer"]),
});

const users = defineGroup({
  prefix: "users",
  endpoints: {
    list: endpoint.get("").response(z.array(UserSchema)),
    get: endpoint.get(":id").variables<{ id: string }>().response(UserSchema),
  },
});

const FileSchema = z.object({ id: z.string(), name: z.string(), size: z.number() });

const files = defineGroup({
  prefix: "files",
  endpoints: {
    upload: endpoint.post("").variables<FormData>().response(FileSchema),
  },
});

/** The upstream the test starts, which answers the users it holds. */
export const shop = defineApi({
  baseURL: process.env.COURIER_E2E_UPSTREAM ?? "http://127.0.0.1:9",
  groups: { users, files },
});
