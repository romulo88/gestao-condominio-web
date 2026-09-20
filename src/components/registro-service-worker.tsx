"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/base-path";

/** Registra o service worker mínimo (`public/service-worker.js`) - funcionalidade PWA,
 * pedido do Romulo. Só o necessário pra contar como instalável nos navegadores que ainda
 * exigem isso; sem cache/offline de propósito, fora do escopo pedido. Montado uma vez no
 * `layout.tsx` raiz, vale pro app inteiro. */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/service-worker.js`).catch(() => {
      // Falha em registrar não deve travar o app - só significa que esse navegador
      // específico não vai contar isso como critério de instalabilidade.
    });
  }, []);

  return null;
}
