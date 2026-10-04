import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Studio's page has no #root element to render into");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
