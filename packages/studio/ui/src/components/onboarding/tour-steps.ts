export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement: "bottom" | "right" | "left" | "top";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar"]',
    title: "Navigation",
    description:
      "Switch between views using the sidebar. Use ⌘K to open the command palette from anywhere.",
    placement: "right",
  },
  {
    target: '[data-tour="timeline"]',
    title: "Timeline",
    description:
      "All API requests in real-time. Click any row to inspect headers, payload, timing, and response.",
    placement: "right",
  },
  {
    target: '[data-tour="waterfall"]',
    title: "Waterfall",
    description:
      "Timing breakdown of every request phase — DNS, connect, TLS, TTFB, download. Zoom, pan, and group.",
    placement: "right",
  },
  {
    target: '[data-tour="analytics"]',
    title: "Analytics",
    description:
      "Dashboard with KPIs, response time charts, status distribution, and endpoint performance table.",
    placement: "right",
  },
  {
    target: '[data-tour="explorer"]',
    title: "Explorer",
    description:
      "Visual API topology graph, endpoints catalog, timing heatmap, and overview dashboard.",
    placement: "right",
  },
  {
    target: '[data-tour="playground"]',
    title: "Playground",
    description:
      "Test endpoints interactively — pick an endpoint, edit the request, and fire it off.",
    placement: "right",
  },
  {
    target: '[data-tour="mocks"]',
    title: "Mocks",
    description:
      "Run a local mock server with zero config. Manage routes, activate scenarios, simulate network conditions, and inspect mock logs.",
    placement: "right",
  },
  {
    target: '[data-tour="apis"]',
    title: "API Registry",
    description: "Import OpenAPI specs or scan your codebase to manage and update API endpoints.",
    placement: "right",
  },
  {
    target: '[data-tour="audit"]',
    title: "Audit",
    description:
      "Automatic code quality analysis — N+1 detection, security checks, performance hints, and a health score.",
    placement: "right",
  },
  {
    target: '[data-tour="middleware"]',
    title: "Middleware",
    description:
      "Visualize middleware overhead, execution chains, and per-endpoint impact with animated pipelines.",
    placement: "right",
  },
  {
    target: '[data-tour="compare"]',
    title: "Compare",
    description: "Side-by-side diff of any two requests — headers, body, timing, and URL params.",
    placement: "right",
  },
  {
    target: '[data-tour="settings"]',
    title: "Settings",
    description:
      "Theme, density, recording limits, export format, notifications, and session management.",
    placement: "right",
  },
  {
    target: '[data-tour="pause"]',
    title: "Pause Recording",
    description:
      "Pause to freeze the request stream while you investigate. New requests won't be captured until you resume.",
    placement: "bottom",
  },
  {
    target: '[data-tour="cmd-k"]',
    title: "Command Palette",
    description: "Search, navigate, and run actions from anywhere without touching the mouse.",
    placement: "bottom",
  },
];

export const TOUR_STORAGE_KEY = "courier-studio-v2:tour-completed";
