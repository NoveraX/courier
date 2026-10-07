"use client";

import { useEffect } from "react";

/* Marks the page once React has hydrated it: a click before then may go unheard. */
export function Hydrated(): null {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
