# Set Courier up

Run it in your project — Next.js, Nuxt, SvelteKit, Astro, React Router, SolidStart, React or Vue with Vite, Expo, Express, Hono, Fastify or NestJS:

```bash
npx @noverax/create-courier
```

It shows its plan, and once you agree adds:

- **A typed example API** and `courier.config.ts`
- **The route** the browser calls it through
- **A mock** the API answers from until `API_URL` names your backend
- **A page** at `/courier` that lists users and creates one

It installs the packages with your package manager and type-checks what it added. Then:

```bash
npm run studio   # Courier Studio, and the mock API it runs
npm run dev      # your app: open /courier
```

For a new project, name a folder and the framework: `npx @noverax/create-courier shop --framework next`.
