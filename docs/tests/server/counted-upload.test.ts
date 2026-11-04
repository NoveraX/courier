/**
 * The upload example's backend reads a file as it streams in and keeps
 * nothing of it: it counts the bytes, which is all the example answers
 * with, and lets them go.
 */
import { Readable } from "node:stream"

import type { Request } from "express"
import { describe, expect, it } from "vitest"

import { countedUpload } from "../../server/routes/counted-upload"

function fileOf(chunks: readonly Uint8Array[]): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "notes.txt",
    encoding: "7bit",
    mimetype: "text/plain",
    size: 0,
    stream: Readable.from(chunks),
    destination: "",
    filename: "",
    path: "",
    buffer: Buffer.alloc(0),
  }
}

function handled(file: Express.Multer.File): Promise<Partial<Express.Multer.File>> {
  return new Promise((resolve, reject) => {
    countedUpload()._handleFile({} as Request, file, (error, info) =>
      error ? reject(error) : resolve(info ?? {})
    )
  })
}

describe("a counted upload", () => {
  it("is its size, counted chunk by chunk, with none of its bytes kept", async () => {
    const info = await handled(
      fileOf([new Uint8Array(1000), new Uint8Array(24), new Uint8Array(0)])
    )
    expect(info).toEqual({ size: 1024 })
  })

  it("fails as its stream does", async () => {
    const file = fileOf([])
    file.stream = new Readable({
      read() {
        this.destroy(new Error("Unexpected end of form"))
      },
    })
    await expect(handled(file)).rejects.toThrow("Unexpected end of form")
  })
})
