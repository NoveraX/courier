/**
 * @vitest-environment jsdom
 *
 * What a sandbox shows of a call's answer. A raw response carries its
 * headers as a `Headers` object, whose entries an object's keys do not
 * show: the view lists them by name, as the answer has them.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { JsonView } from "@/site/sandbox/json-view"

/* The text a browser shows of the view's markup, each character reference read. */
function shown(value: unknown): string {
  const template = document.createElement("template")
  template.innerHTML = renderToStaticMarkup(createElement(JsonView, { value }))
  return template.content.textContent ?? ""
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

  it("shows the characters markup escapes as they are", () => {
    const text = shown({ link: "<https://x>", pair: "a&b", name: "O'Hara" })

    expect(text).toContain('"link": "<https://x>"')
    expect(text).toContain('"pair": "a&b"')
    expect(text).toContain('"name": "O\'Hara"')
  })
})
