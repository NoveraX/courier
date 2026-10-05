import { courier, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

import { catalogCache } from "./middleware";
import { Product, Review } from "./schemas";

const { endpoint } = courier();
const cached = courier({ middleware: [catalogCache] });

/** What the shop sells: by category, searched, one by one, and what buyers said of it. */
export const products = defineGroup({
  prefix: "products",
  endpoints: {
    list: cached.endpoint
      .get("")
      .variables(z.object({ category: Product.shape.category.optional() }))
      .response(z.array(Product)),
    search: endpoint
      .get("search")
      .variables(z.object({ q: z.string().min(1) }))
      .response(z.array(Product)),
    get: cached.endpoint
      .get(":id")
      .variables(z.object({ id: z.string() }))
      .response(Product),
    reviews: cached.endpoint
      .get(":id/reviews")
      .variables(z.object({ id: z.string() }))
      .response(z.array(Review)),
  },
});
