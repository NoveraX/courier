import { courierRoutesModule } from "@noverax/courier-nuxt/plugin";

/* The application built by Nuxt's rspack builder in place of its Vite one, with Courier's routes module. */
export default defineNuxtConfig({
  devtools: { enabled: false },
  compatibilityDate: "2025-01-01",
  builder: "rspack",
  modules: [courierRoutesModule],
});
