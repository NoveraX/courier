import cors from "cors"
import express from "express"
import echoRouter from "./routes/echo.js"
import miscRouter from "./routes/misc.js"
import postsRouter from "./routes/posts.js"
import uploadRouter from "./routes/upload.js"
import usersRouter from "./routes/users.js"

const app = express()
const PORT = Number(process.env.EXPRESS_PORT ?? 4000)

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        cb(null, true)
      } else {
        cb(new Error("Not allowed by CORS"))
      }
    },
    credentials: true,
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/users", usersRouter)
app.use("/posts", postsRouter)
app.use("/upload", uploadRouter)
app.use("/echo", echoRouter)
app.use("/", miscRouter)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

const listening = (): void => {
  console.log(`Express mock backend running on http://localhost:${PORT}`)
}

/* The site's image keeps the backend to its container: only the pages call it. */
const HOST = process.env.EXPRESS_HOST
if (HOST) app.listen(PORT, HOST, listening)
else app.listen(PORT, listening)
