/**
 * @vitest-environment jsdom
 *
 * Where focus goes once a dialog or sheet over the page has closed: back to
 * the control that opens it; for one a shortcut opens, back to where the
 * reader was, or to that control once where they were has gone; nowhere
 * after a link the reader followed; and nowhere either when it is on
 * another element by the time Radix asks — a moment after the overlay has
 * left the page, which jsdom, playing no exit animation, makes last until
 * the timers run.
 */
import { Dialog } from "radix-ui"
import { act, createElement as h, useEffect, useRef, useState } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useReturnFocus } from "@/site/use-return-focus"

/* What Testing Library sets: React then expects every update inside act(), as these come. */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
  vi.useRealTimers()
})

/* A sheet the header's Menu opens, wired as the site's sheets and dialogs are; ⌘K opens it too. */
function Sheet({ shortcut }: { shortcut: boolean }) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(true)
  const menu = useRef<HTMLButtonElement>(null)
  const returnFocus = useReturnFocus(menu, { shortcut })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && event.metaKey) setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return h(
    "div",
    null,
    h("button", { ref: menu, type: "button", onClick: () => setOpen(true) }, "Menu"),
    field && h("textarea", { "aria-label": "Field" }),
    h("textarea", { "aria-label": "Editor" }),
    h(
      Dialog.Root,
      { open, onOpenChange: setOpen },
      h(
        Dialog.Portal,
        null,
        h(
          Dialog.Content,
          {
            "aria-describedby": undefined,
            onOpenAutoFocus: returnFocus.remember,
            onCloseAutoFocus: returnFocus.restore,
          },
          h(Dialog.Title, null, "Navigation"),
          h(
            "button",
            {
              type: "button",
              onClick: () => {
                returnFocus.leave()
                setOpen(false)
              },
            },
            "Quick start"
          ),
          h("button", { type: "button", onClick: () => setField(false) }, "Drop the field"),
          h(Dialog.Close, null, "Close")
        )
      )
    )
  )
}

function render({ shortcut = false } = {}): void {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(h(Sheet, { shortcut })))
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent === name)
  if (!found) throw new Error(`No button ${name}`)
  return found
}

function textarea(label: string): HTMLTextAreaElement {
  const found = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)
  if (!found) throw new Error(`No textarea ${label}`)
  return found
}

/* The sheet opens on a timer or two of its own: its listeners, its focus inside. */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50)
  })
}

function click(name: string): void {
  act(() => button(name).click())
}

/* The moment runs out: Radix asks where the focus goes. */
function askForFocus(): void {
  act(() => vi.runOnlyPendingTimers())
}

describe("useReturnFocus", () => {
  it("gives focus back to the control that opens the overlay once it has gone", async () => {
    render()
    click("Menu")
    await settle()

    click("Close")
    expect(document.activeElement).toBe(document.body)
    askForFocus()

    expect(document.activeElement).toBe(button("Menu"))
  })

  it("leaves focus on an element that took it while the overlay went", async () => {
    render()
    click("Menu")
    await settle()

    click("Close")
    textarea("Editor").focus()
    askForFocus()

    expect(document.activeElement).toBe(textarea("Editor"))
  })

  it("leaves focus to where a followed link takes the reader", async () => {
    render()
    click("Menu")
    await settle()

    click("Quick start")
    askForFocus()

    expect(document.activeElement).toBe(document.body)
  })

  it("gives focus back to where the reader was, for an overlay a shortcut opens", async () => {
    render({ shortcut: true })
    textarea("Field").focus()
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
    })
    await settle()

    click("Close")
    askForFocus()

    expect(document.activeElement).toBe(textarea("Field"))
  })

  it("gives it to the control that opens the overlay once where the reader was has gone", async () => {
    render({ shortcut: true })
    textarea("Field").focus()
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
    })
    await settle()

    click("Drop the field")
    click("Close")
    askForFocus()

    expect(document.activeElement).toBe(button("Menu"))
  })
})
