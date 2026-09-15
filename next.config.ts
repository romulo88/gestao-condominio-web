import type { NextConfig } from "next";

// URL do backend vista DE DENTRO do container do frontend (não do navegador) - só usada
// pelo proxy `/api/*` abaixo.
//
// ⚠️ `rewrites()` é avaliado em BUILD TIME, não a cada request: o Next grava o destino já
// resolvido em `.next/routes-manifest.json` e o `server.js` do build standalone nunca mais
// lê `process.env.BACKEND_URL`. Ou seja: definir BACKEND_URL no `environment:` de um
// docker-compose NÃO tem efeito nenhum - a URL tem que estar certa na hora do `npm run
// build`. Em produção isso é feito com `--build-arg BACKEND_URL=http://backend:8080`
// (ver frontend/Dockerfile e o workflow de deploy).
//
// Default aponta pro backend rodando no host via `mvn spring-boot:run` (fora do compose,
// por isso `host.docker.internal` e não o nome de um serviço) - é o cenário de dev local.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://host.docker.internal:8080";

const nextConfig: NextConfig = {
  // Build de produção enxuta pro Dockerfile (copia só o necessário pra rodar, sem o
  // node_modules inteiro) - usado pelo serviço `frontend` do docker-compose.yml.
  output: "standalone",
  // Proxy de /api/* pro backend (pedido do Romulo, resolvido durante teste via ngrok:
  // o navegador só fala com UMA origem - a mesma do site - então não importa se é
  // localhost:3000, IP da rede local ou um domínio de tunel; sem isso o JS do navegador
  // tentava chamar http://localhost:8080 direto, que no celular não existe (dá "Load
  // failed"), e mesmo corrigindo isso ainda esbarraria em CORS. Como bônus elimina CORS
  // de vez, já que a chamada real ao backend passa a ser servidor-a-servidor.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
