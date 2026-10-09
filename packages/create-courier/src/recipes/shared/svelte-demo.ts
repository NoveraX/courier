import { majorOf } from "../../project/read-project";
import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, EMAIL_FROM_NAME, globalDemoCss, unreachableText } from "./demo-parts";

/* Svelte 5's runes, which SvelteKit's own template asks every component of the app for. */
function runesScript(caller: string): string {
  return `<script lang="ts">
	import { onMount } from "svelte";

	import { courier } from "${caller}";

	type User = Awaited<ReturnType<typeof courier.users.list>>[number];

	let users = $state<User[]>();
	let failure = $state<string>();
	let name = $state("");
	let adding = $state(false);

	async function load() {
		try {
			users = await courier.users.list();
			failure = undefined;
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		adding = true;
		try {
			await courier.users.create({ name, email: ${EMAIL_FROM_NAME} });
			name = "";
			await load();
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		} finally {
			adding = false;
		}
	}

	onMount(load);
</script>`;
}

/* Svelte 4's reactive declarations. */
function legacyScript(caller: string): string {
  return runesScript(caller)
    .replace("let users = $state<User[]>();", "let users: User[] | undefined;")
    .replace("let failure = $state<string>();", "let failure: string | undefined;")
    .replace('let name = $state("");', 'let name = "";')
    .replace("let adding = $state(false);", "let adding = false;");
}

/**
 * A SvelteKit page that shows Courier at work: the users the API answers
 * with — from the mock until VITE_API_URL names a backend — and a form
 * that creates one, called from the browser through the app's route. It
 * uses runes on Svelte 5, as SvelteKit's template asks, and Svelte 4's
 * syntax before it.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - Where the page goes, relative to the root
 * @param caller - The `caller.ts` module, relative to the root
 * @returns The page
 * @example
 * ```ts
 * svelteDemo(ctx, "src/routes/courier/+page.svelte", "src/lib/courier/caller.ts");
 * ```
 */
export function svelteDemo(ctx: RecipeContext, path: string, caller: string): RecipeFile {
  const from = importSpecifier(path, caller, ctx.extension);
  const runes = (majorOf(ctx.project.version("svelte")) ?? 5) >= 5;
  const submit = runes ? "onsubmit={add}" : "on:submit={add}";
  const content = `${runes ? runesScript(from) : legacyScript(from)}

<svelte:head>
	<title>${DEMO_TEXT.title}</title>
</svelte:head>

<main class="courier-demo">
	<h1>${DEMO_TEXT.title}</h1>
	<p>${DEMO_TEXT.lead}</p>
	{#if failure}
		<p role="alert">Could not load users: {failure}. ${unreachableText(ctx, "VITE_API_URL")}</p>
	{:else if users === undefined}
		<p>${DEMO_TEXT.loading}</p>
	{:else}
		<ul>
			{#each users as user (user.id)}
				<li>{user.name} <small>{user.email}</small></li>
			{/each}
		</ul>
		<form ${submit}>
			<input bind:value={name} placeholder="Name" required />
			<button type="submit" disabled={adding}>${DEMO_TEXT.add}</button>
		</form>
	{/if}
</main>

<style>
${globalDemoCss()
  .split("\n")
  .map((rule) => `\t${rule}`)
  .join("\n")}
</style>
`;
  return { path, content, purpose: "a page that shows Courier at work" };
}
