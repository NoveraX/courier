import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeFile } from "../recipe-types";
import { DEMO_TEXT, EMAIL_FROM_NAME, unreachableText } from "./demo-parts";
import { DEMO_CSS } from "./demo-style";

/**
 * An Astro page that shows Courier at work: the users the API answers
 * with — from the mock until VITE_API_URL names a backend — and a form
 * that creates one, called from the page's script through the app's route.
 * The page itself is static; only the route renders on demand.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - Where the page goes, relative to the root
 * @param caller - The `caller.ts` module, relative to the root
 * @returns The page
 * @example
 * ```ts
 * astroDemo(ctx, "src/pages/courier.astro", "src/courier/caller.ts");
 * ```
 */
export function astroDemo(ctx: RecipeContext, path: string, caller: string): RecipeFile {
  const content = `---
// Courier at work: your API's users, and a form that creates one.
---

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width" />
		<meta name="color-scheme" content="light dark" />
		<title>${DEMO_TEXT.title}</title>
	</head>
	<body>
		<main class="courier-demo">
			<h1>${DEMO_TEXT.title}</h1>
			<p>${DEMO_TEXT.lead}</p>
			<p id="courier-status">${DEMO_TEXT.loading}</p>
			<ul id="courier-users" hidden></ul>
			<form id="courier-add" hidden>
				<input name="name" placeholder="Name" required />
				<button type="submit">${DEMO_TEXT.add}</button>
			</form>
		</main>
		<script>
			import { courier } from "${importSpecifier(path, caller, ctx.extension)}";

			function element<T extends Element>(selector: string): T {
				const found = document.querySelector<T>(selector);
				if (found === null) throw new Error(\`\${selector} is not on the page\`);
				return found;
			}

			const status = element<HTMLParagraphElement>("#courier-status");
			const list = element<HTMLUListElement>("#courier-users");
			const form = element<HTMLFormElement>("#courier-add");
			const input = element<HTMLInputElement>("#courier-add input");
			const button = element<HTMLButtonElement>("#courier-add button");

			function fail(error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				status.textContent = \`Could not load users: \${message}. ${unreachableText(ctx, "VITE_API_URL")}\`;
				status.setAttribute("role", "alert");
				status.hidden = false;
			}

			async function load() {
				try {
					const users = await courier.users.list();
					list.replaceChildren(
						...users.map((user) => {
							const item = document.createElement("li");
							const email = document.createElement("small");
							email.textContent = user.email;
							item.append(user.name, " ", email);
							return item;
						}),
					);
					status.hidden = true;
					list.hidden = false;
					form.hidden = false;
				} catch (error) {
					fail(error);
				}
			}

			form.addEventListener("submit", async (event) => {
				event.preventDefault();
				const name = input.value;
				button.disabled = true;
				try {
					await courier.users.create({ name, email: ${EMAIL_FROM_NAME} });
					input.value = "";
					await load();
				} catch (error) {
					fail(error);
				} finally {
					button.disabled = false;
				}
			});

			void load();
		</script>
		<style is:global>
${DEMO_CSS.split("\n")
  .map((rule) => `\t\t\t${rule}`)
  .join("\n")}
		</style>
	</body>
</html>
`;
  return { path, content, purpose: "a page that shows Courier at work" };
}
