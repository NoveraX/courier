import { courierRoutesModule } from "@noverax/courier-nuxt/plugin";

export default defineNuxtConfig({
  devtools: { enabled: false },
  compatibilityDate: "2025-01-01",
  modules: [courierRoutesModule],
});
