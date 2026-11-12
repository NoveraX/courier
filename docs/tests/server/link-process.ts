/**
 * The link between the site's server and its backend (see `link.ts`), in a
 * process of its own. It takes all a connection sends at once and hands it
 * on to the backend at its pace — or, while held, not at all; the answers
 * come back as they are sent.
 *
 * Run with the backend's port, it names its own once it listens, and says
 * each word it is told on its input — `hold`, `release` — back once done.
 * It ends when its input does, so that it never outlives the test.
 */
import { connect, createServer, type Socket } from "node:net"
import { createInterface } from "node:readline"

/* A megabyte every 5 ms: slower than the site's server sends one. */
const PACE_BYTES = 1024 * 1024
const TICK_MS = 5

/** A piece on its way to the backend or, with no data, the end of what its connection sent. */
interface Piece {
  readonly to: Socket
  readonly data?: Buffer | undefined
}

const backendPort = Number(process.argv[2])
const queue: Piece[] = []
let held = false
let tick: NodeJS.Timeout | undefined

/* Hand on what is queued, up to the pace, and come back for the rest. */
function handOn(): void {
  tick = undefined
  if (held) return
  let room = PACE_BYTES
  while (room > 0) {
    const piece = queue.shift()
    if (piece === undefined) return
    if (piece.data === undefined) {
      piece.to.end()
    } else {
      piece.to.write(piece.data)
      room -= piece.data.byteLength
    }
  }
  tick = setTimeout(handOn, TICK_MS)
}

/* Hand on soon, unless the link is held or already means to. */
function resume(): void {
  if (!held && tick === undefined) tick = setTimeout(handOn, 0)
}

function send(piece: Piece): void {
  queue.push(piece)
  resume()
}

const server = createServer((near) => {
  const far = connect(backendPort, "127.0.0.1")
  near.on("data", (data: Buffer) => send({ to: far, data }))
  near.on("end", () => send({ to: far }))
  far.on("data", (data: Buffer) => near.write(data))
  far.on("end", () => near.end())
  /* A connection that fails takes the other end with it. */
  near.on("error", () => far.destroy())
  far.on("error", () => near.destroy())
  far.on("close", () => near.destroy())
})

server.listen(0, "127.0.0.1", () => {
  const address = server.address()
  if (address === null || typeof address === "string") return
  process.stdout.write(`The link listens on http://127.0.0.1:${address.port}\n`)
})

createInterface({ input: process.stdin })
  .on("line", (word) => {
    if (word === "hold") {
      held = true
    } else if (word === "release") {
      held = false
      resume()
    } else {
      return
    }
    process.stdout.write(`${word}\n`)
  })
  .on("close", () => process.exit(0))
