"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* Falha silenciosa — PWA ainda funciona via manifest no iOS */
    });
  }, []);

  return null;
}
