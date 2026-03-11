import { collectCssRules } from "./graph-builder"

export function exportGraphSvg(wrapperEl: HTMLDivElement) {
  const nodeEls = wrapperEl.querySelectorAll<HTMLElement>(".react-flow__node")
  if (nodeEls.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of nodeEls) {
    const rect = node.getBoundingClientRect()
    minX = Math.min(minX, rect.left)
    minY = Math.min(minY, rect.top)
    maxX = Math.max(maxX, rect.right)
    maxY = Math.max(maxY, rect.bottom)
  }

  const padding = 40
  const width = maxX - minX + padding * 2
  const height = maxY - minY + padding * 2

  const svgNs = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(svgNs, "svg")
  svg.setAttribute("width", String(width))
  svg.setAttribute("height", String(height))
  svg.setAttribute("xmlns", svgNs)
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")

  const fo = document.createElementNS(svgNs, "foreignObject")
  fo.setAttribute("width", "100%")
  fo.setAttribute("height", "100%")

  const flowEl = wrapperEl.querySelector(".react-flow") as HTMLElement | null
  if (!flowEl) return

  const clone = flowEl.cloneNode(true) as HTMLElement
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.position = "relative"

  const styleEl = document.createElement("style")
  styleEl.textContent = collectCssRules()
  clone.insertBefore(styleEl, clone.firstChild)

  fo.appendChild(clone)
  svg.appendChild(fo)

  const svgData = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.download = "nexus-api-graph.svg"
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}
