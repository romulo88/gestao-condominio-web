# Build multi-stage: instala deps, builda com output "standalone" e roda com uma imagem enxuta.
#
# NEXT_PUBLIC_API_URL não é setada aqui - o navegador fala só com a própria origem (default
# vazio em src/lib/api.ts) e quem chama o backend é o servidor Next, via proxy `rewrites()`.
#
# BACKEND_URL, por outro lado, PRECISA ser build arg: o Next resolve o destino do
# `rewrites()` durante o `npm run build` e grava em `.next/routes-manifest.json` - o
# server.js do build standalone não lê essa env em runtime. Passar BACKEND_URL no
# `environment:` do compose não tem efeito. Sem este ARG a imagem sai apontando pro default
# de dev (`host.docker.internal`), que não resolve dentro de um container Linux: o site
# sobe, a tela de login renderiza, e toda chamada de API falha.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG BACKEND_URL=http://backend:8080
ENV BACKEND_URL=$BACKEND_URL
# Subcaminho de produção (ex.: /commander) - build-time como o BACKEND_URL; vazio = raiz.
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN echo "Buildando com BACKEND_URL=$BACKEND_URL" && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Sem HOSTNAME explicito o server.js do build standalone pode subir preso em
# localhost - de dentro do container isso significa que ninguem de fora alcanca,
# nem o Traefik. PORT fica explicito pelo mesmo motivo (o label do Traefik aponta
# pra 3000).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Redeclarado aqui só pro HEALTHCHECK abaixo achar /login sob o mesmo prefixo do build.
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:3000${NEXT_PUBLIC_BASE_PATH}/login" > /dev/null || exit 1

CMD ["node", "server.js"]
