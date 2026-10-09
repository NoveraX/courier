import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, EMAIL_FROM_NAME, unreachableText } from "./demo-parts";
import { DEMO_CSS } from "./demo-style";

/**
 * A Vue page that shows Courier at work: the users the API answers with —
 * from the mock until the API's address names a backend — and a form that
 * creates one: in Nuxt through the app's route, in an app of Vite's
 * straight to the API.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - Where the page goes, relative to the root
 * @param caller - The `caller.ts` module: relative to the root, or as an alias the framework resolves, `#shared/courier/caller`
 * @param variable - The environment variable the API's address is read from
 * @returns The page
 * @example
 * ```ts
 * vueDemo(ctx, "app/pages/courier.vue", "shared/courier/caller.ts");
 * ```
 */
export function vueDemo(
  ctx: RecipeContext,
  path: string,
  caller: string,
  variable = "API_URL",
): RecipeFile {
  /* Nuxt names the page through useHead; a page of Vite's has its own <title>. */
  const head = ctx.project.lists("nuxt") ? `\nuseHead({ title: "${DEMO_TEXT.title}" });` : "";
  const content = `<script setup lang="ts">
import { onMounted, ref } from "vue";

import { courier } from "${caller.startsWith("#") ? caller : importSpecifier(path, caller, ctx.extension)}";

type User = Awaited<ReturnType<typeof courier.users.list>>[number];

const users = ref<User[]>();
const failure = ref<string>();
const name = ref("");
const adding = ref(false);

async function load() {
  try {
    users.value = await courier.users.list();
    failure.value = undefined;
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error);
  }
}

async function add() {
  adding.value = true;
  try {
    await courier.users.create({ name: name.value, email: ${EMAIL_FROM_NAME.replaceAll("name.", "name.value.")} });
    name.value = "";
    await load();
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error);
  } finally {
    adding.value = false;
  }
}

onMounted(load);${head}
</script>

<template>
  <main class="courier-demo">
    <h1>${DEMO_TEXT.title}</h1>
    <p>${DEMO_TEXT.lead}</p>
    <p v-if="failure" role="alert">Could not load users: {{ failure }}. ${unreachableText(ctx, variable)}</p>
    <p v-else-if="users === undefined">${DEMO_TEXT.loading}</p>
    <template v-else>
      <ul>
        <li v-for="user in users" :key="user.id">{{ user.name }} <small>{{ user.email }}</small></li>
      </ul>
      <form @submit.prevent="add">
        <input v-model="name" placeholder="Name" required />
        <button type="submit" :disabled="adding">${DEMO_TEXT.add}</button>
      </form>
    </template>
  </main>
</template>

<style>
${DEMO_CSS}
</style>
`;
  return { path, content, purpose: "a page that shows Courier at work" };
}
