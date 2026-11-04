/**
 * The upload example's endpoint takes one file in the form's `file` field
 * and a few short fields beside it, each to its limit, and says in JSON
 * what stopped any other form.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "./serve"

const MIB = 1024 * 1024

let backend: Served

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
})

afterAll(() => backend.close())

function file(bytes: number, name = "notes.txt"): File {
  return new File([new Uint8Array(bytes)], name, { type: "text/plain" })
}

async function upload(
  form: FormData | string,
  type?: string
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${backend.url}/upload`, {
    method: "POST",
    body: form,
    ...(type !== undefined && { headers: { "content-type": type } }),
  })
  return { status: response.status, body: await response.json() }
}

describe("an upload", () => {
  it("is answered with the file it took and the fields beside it", async () => {
    const form = new FormData()
    form.append("file", file(1000))
    form.append("description", "Uploaded from the Courier docs")
    expect(await upload(form)).toEqual({
      status: 200,
      body: {
        success: true,
        file: { originalName: "notes.txt", mimeType: "text/plain", size: 1000 },
        fields: { description: "Uploaded from the Courier docs" },
      },
    })
  })

  it("takes a file as large as the limit", async () => {
    const form = new FormData()
    form.append("file", file(MIB))
    expect(await upload(form)).toMatchObject({ status: 200, body: { file: { size: MIB } } })
  })

  it("refuses a file larger than the limit, naming the limit", async () => {
    const form = new FormData()
    form.append("file", file(MIB + 1))
    expect(await upload(form)).toEqual({
      status: 413,
      body: {
        success: false,
        code: "BODY_TOO_LARGE",
        message: "The file is larger than the 1 MiB the backend takes",
      },
    })
  })

  it("refuses a second file, and a file in another field", async () => {
    const two = new FormData()
    two.append("file", file(10))
    two.append("file", file(10, "more.txt"))
    const elsewhere = new FormData()
    elsewhere.append("attachment", file(10))
    for (const form of [two, elsewhere]) {
      expect(await upload(form)).toMatchObject({ status: 400, body: { code: "UPLOAD_REFUSED" } })
    }
  })

  it("refuses more fields than it reads, and a field longer than it reads", async () => {
    const many = new FormData()
    many.append("file", file(10))
    for (let index = 0; index < 11; index += 1) many.append(`field${index}`, "x")
    const long = new FormData()
    long.append("file", file(10))
    long.append("description", "x".repeat(1025))
    for (const form of [many, long]) {
      expect(await upload(form)).toMatchObject({ status: 413, body: { code: "UPLOAD_REFUSED" } })
    }
  })

  it("refuses a form without a file", async () => {
    const form = new FormData()
    form.append("description", "no file")
    expect(await upload(form)).toMatchObject({ status: 400, body: { code: "INVALID_FIELD" } })
  })

  it("refuses a body that is not the form it says it is", async () => {
    expect(await upload("--x\r\nnot a part", "multipart/form-data; boundary=x")).toMatchObject({
      status: 400,
      body: { code: "INVALID_BODY" },
    })
  })
})
