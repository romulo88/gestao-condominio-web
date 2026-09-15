import type { MetadataRoute } from "next";

/** PWA (pedido do Romulo, v119): instalável no celular, focado em abrir e acompanhar
 * demandas - `start_url` cai direto em `/demandas` (que já reúne "+ Nova demanda" e a
 * listagem numa tela só, mesmo escopo pedido). Continua exigindo login normalmente - a
 * trava de sessão (`useSessaoObrigatoria`) não muda em nada, só a tela que o ícone tenta
 * abrir primeiro: sem sessão válida, cai no login do mesmo jeito que cairia se alguém
 * digitasse essa URL direto no navegador. `scope: "/"` (não só "/demandas") pra outras
 * telas do app (trocar de perfil, sair, etc.) continuarem dentro da janela instalada,
 * sem sair pro navegador comum. Ícones gerados em `pwa-icon/[size]/route.tsx`. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/demandas",
    name: "Commander",
    short_name: "Commander",
    description: "Abra e acompanhe as demandas do seu condomínio.",
    start_url: "/demandas",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
