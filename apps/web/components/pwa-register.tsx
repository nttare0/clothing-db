"use client";

import { useEffect } from "react";

/** Registers the ClothFlow service worker so the app can be installed and open offline-ish. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("sw_register_failed", err);
    });
  }, []);
  return null;
}
