"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Force the new SW to take over immediately
          if (reg.waiting) {
            reg.waiting.postMessage("skipWaiting");
          }
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  newWorker.postMessage("skipWaiting");
                }
              });
            }
          });
        })
        .catch((err) => console.warn("SW registration failed:", err));
    }
  }, []);

  return null;
}
