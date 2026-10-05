import { attachRuntime } from "@noverax/courier-studio-core/runtime";
import { driveMocks } from "./mock-traffic";
import { pause } from "./random";
import { visit } from "./visit";
import { askSupport, checkAccount, followDeals, followOrders } from "./watch";

const SHOPPERS = ["ada", "grace", "linus", "margaret"].slice(0, Number(process.env.SHOPPERS ?? 2));

/* Run a task again and again, a pause between runs; one that fails is reported, and runs again. */
async function forever(
  task: () => Promise<unknown>,
  minPause: number,
  maxPause: number,
): Promise<never> {
  for (;;) {
    try {
      await task();
    } catch (error) {
      console.warn("A shopper's task failed:", error);
    }
    await pause(minPause, maxPause);
  }
}

/* The shop's visitors, as their pages and the shop's server code call it, and a front end
   developed against the mocks. Attached to Studio, every call shows in its Timeline. */
await attachRuntime("storefront");
for (const shopper of SHOPPERS) void forever(() => visit(shopper), 3_000, 6_000);
void forever(() => followOrders(20_000), 5_000, 15_000);
void forever(() => followDeals(30_000), 10_000, 20_000);
void forever(askSupport, 20_000, 40_000);
void forever(checkAccount, 15_000, 25_000);
void forever(driveMocks, 1_500, 2_500);
console.log(`Traffic from ${SHOPPERS.length} shoppers, their pages and the mocks' front end`);
