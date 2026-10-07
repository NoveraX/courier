import { QueryClient, QueryClientProvider } from "@noverax/courier-react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
