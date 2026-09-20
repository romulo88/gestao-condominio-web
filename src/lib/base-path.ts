// Subcaminho onde o app é servido (ex.: "/commander"). Mesmo valor do `basePath` do
// next.config.ts, injetado em build via NEXT_PUBLIC_BASE_PATH. Vazio em dev local.
// `next/link` e `next/navigation` já aplicam o prefixo sozinhos; fetch(), manifest e
// service worker não - esses precisam usar esta constante.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
