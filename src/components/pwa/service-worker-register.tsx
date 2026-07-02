"use client";

import { useEffect } from "react";

/** Registra service worker para instalação PWA (Add to Home Screen). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* falha silenciosa — app continua funcionando sem PWA */
    });
  }, []);

  return null;
}
