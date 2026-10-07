import { client } from "$lib/server/api";

export async function load() {
  return { me: await client.me() };
}

export const actions = {
  login: async ({ cookies }) => {
    await client.login({ user: "ada" });
    cookies.set("signed_in", "yes", { path: "/", httpOnly: false });
  },
  rename: async ({ request }) => {
    const form = await request.formData();
    await client.rename({ name: String(form.get("name")) });
  },
};
