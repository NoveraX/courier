import { createDemoApp } from "./app"

const app = createDemoApp()
const PORT = Number(process.env.EXPRESS_PORT ?? 4000)

const listening = (): void => {
  console.log(`Express mock backend running on http://localhost:${PORT}`)
}

/* The site's image keeps the backend to its container: only the site's server calls it. */
const HOST = process.env.EXPRESS_HOST
if (HOST) app.listen(PORT, HOST, listening)
else app.listen(PORT, listening)
