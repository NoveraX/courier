/** A client or a backend in the diagram, and the path its calls run along. */
export interface TransportNode {
  label: string
  x: number
  y: number
  path: string
  /** Where along its run the path's beam starts, so the beams do not move in step. */
  delay: string
}

/** One way of drawing the diagram: where everything sits, and how big. */
export interface TransportLayout {
  viewBox: string
  nodeWidth: number
  fontSize: number
  clients: readonly TransportNode[]
  backends: readonly TransportNode[]
  /** The route's box, top left. */
  route: { x: number; y: number }
  /** Where "your server" is written beside the route, and how it is anchored. */
  server: { x: number; y: number; anchor: "middle" | "start" }
  /** Where the two sides are named. */
  headings: { clients: [number, number]; backends: [number, number] }
}

/** Clients on the left, the route in the middle, backends on the right. */
export const WIDE: TransportLayout = {
  viewBox: "0 0 440 300",
  nodeWidth: 112,
  fontSize: 13,
  clients: [
    { label: "Browser", x: 0, y: 30, path: "M112 49 C 146 49, 132 150, 166 150", delay: "0s" },
    { label: "Server comp.", x: 0, y: 131, path: "M112 150 L 166 150", delay: "-0.8s" },
    {
      label: "Vue · Nuxt",
      x: 0,
      y: 232,
      path: "M112 251 C 146 251, 132 150, 166 150",
      delay: "-1.6s",
    },
  ],
  backends: [
    { label: "Express", x: 328, y: 30, path: "M274 150 C 308 150, 294 49, 328 49", delay: "-1.2s" },
    { label: "FastAPI", x: 328, y: 131, path: "M274 150 L 328 150", delay: "-2s" },
    {
      label: "Go · Rails",
      x: 328,
      y: 232,
      path: "M274 150 C 308 150, 294 251, 328 251",
      delay: "-2.8s",
    },
  ],
  route: { x: 166, y: 131 },
  server: { x: 220, y: 187, anchor: "middle" },
  headings: { clients: [56, 16], backends: [384, 16] },
}

/** Clients above, the route in the middle, backends below — for a phone's width. */
export const STACKED: TransportLayout = {
  viewBox: "0 0 300 352",
  nodeWidth: 92,
  fontSize: 12,
  clients: [
    { label: "Browser", x: 0, y: 24, path: "M46 62 C 46 116, 150 116, 150 171", delay: "0s" },
    { label: "Server comp.", x: 104, y: 24, path: "M150 62 L 150 171", delay: "-0.8s" },
    {
      label: "Vue · Nuxt",
      x: 208,
      y: 24,
      path: "M254 62 C 254 116, 150 116, 150 171",
      delay: "-1.6s",
    },
  ],
  backends: [
    { label: "Express", x: 0, y: 290, path: "M150 209 C 150 250, 46 250, 46 290", delay: "-1.2s" },
    { label: "FastAPI", x: 104, y: 290, path: "M150 209 L 150 290", delay: "-2s" },
    {
      label: "Go · Rails",
      x: 208,
      y: 290,
      path: "M150 209 C 150 250, 254 250, 254 290",
      delay: "-2.8s",
    },
  ],
  route: { x: 96, y: 171 },
  server: { x: 212, y: 194, anchor: "start" },
  headings: { clients: [150, 14], backends: [150, 346] },
}
