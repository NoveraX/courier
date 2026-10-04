import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadFonts } from "./lib/load-fonts";
import { router } from "./router";
import "./index.css";

loadFonts(document);

const root = document.getElementById("root");
if (!root) throw new Error("Studio's page has no #root element to render into");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
