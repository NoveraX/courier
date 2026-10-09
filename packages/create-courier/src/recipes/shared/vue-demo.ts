import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, EMAIL_FROM_NAME, unreachableText } from "./demo-parts";
import { DEMO_CSS } from "./demo-style";

/**
 * A Nuxt page that shows Courier at work: the users the API answers with —
 * from the mock until API_URL names a backend — and a form that creates
 * one, called from the browser through the app's route.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - Where the page goes, relative to the root
 * @param caller - The `caller.ts` module, relative to the root
 * @returns The page
 * @example
 * ```ts
 * vueDemo(ctx, "app/pages/courier.vue", "shared/courier/caller.ts");
 * ```
 */
export function vueDemo(ctx: RecipeContext, path: string, caller: string): RecipeFile {
  const content = `<script setup lang="ts">
import { onMounted, ref } from "vue";

import { courier } from "${importSpecifier(path, caller, ctx.extension)}";

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

onMounted(load);
useHead({ title: "${DEMO_TEXT.title}" });
</script>

<template>
  <main class="courier-demo">
    <h1>${DEMO_TEXT.title}</h1>
    <p>${DEMO_TEXT.lead}</p>
    <p v-if="failure" role="alert">Could not load users: {{ failure }}. ${unreachableText(ctx, "API_URL")}</p>
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
