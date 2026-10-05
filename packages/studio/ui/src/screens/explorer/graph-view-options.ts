/**
 * How the graph is viewed: how it fits its frame — at first and on demand,
 * never larger than life — how far it zooms out and in, and from how many
 * nodes a minimap shows where the view is.
 */
export const GRAPH_VIEW = {
  fit: { padding: 0.08, maxZoom: 1 },
  zoom: { min: 0.15, max: 1.75 },
  minimapFrom: 24,
} as const;
