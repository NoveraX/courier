/**
 * What a sandbox shows of a call's answer. A raw response carries its
 * headers as a `Headers` object, whose entries an object's keys do not
 * show: the view lists them by name, as the answer has them.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { JsonView } from "@/site/sandbox/json-view"

function shown(value: unknown): string {
  const html = renderToStaticMarkup(createElement(JsonView, { value }))
  return html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"')
}

describe("a sandbox's answer", () => {
  it("lists a response's headers by their names and values", () => {
    const headers = new Headers({ etag: 'W/"1"', vary: "Origin" })

    expect(shown({ status: 200, headers })).toContain('"etag": "W/\\"1\\""')
    expect(shown({ status: 200, headers })).toContain('"vary": "Origin"')
  })

  it("shows an empty object as one", () => {
    expect(shown({ headers: {} })).toContain('"headers": {}')
  })
})
