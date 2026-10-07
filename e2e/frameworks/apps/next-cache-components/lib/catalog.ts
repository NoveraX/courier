import { courier, defineApi } from "@noverax/courier/define";
import { createServerCaller } from "@noverax/courier-next";

import { API_URL } from "./api-url";

const { endpoint } = courier();

/* An API with a session, and an endpoint of it every user sees alike. */
export const catalog = createServerCaller(
  defineApi({
    name: "catalog",
    baseURL: API_URL,
    session: { cookies: ["sid"] },
    endpoints: { products: endpoint.get("products", { session: false }).response<unknown>() },
  }),
);
