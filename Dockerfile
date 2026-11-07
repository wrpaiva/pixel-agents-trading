# Constrói o Pixel Agents 1.5.0 a partir do fonte versionado em vendor/, com a
# Trading Room (src/trading) empacotada pelo esbuild do upstream.
FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY vendor/pixel-agents/package.json vendor/pixel-agents/package-lock.json vendor/pixel-agents/
COPY vendor/pixel-agents/server/package.json vendor/pixel-agents/server/
COPY vendor/pixel-agents/webview-ui/package.json vendor/pixel-agents/webview-ui/
RUN cd vendor/pixel-agents && npm ci --ignore-scripts
COPY vendor/pixel-agents vendor/pixel-agents
COPY src src
RUN cd vendor/pixel-agents \
 && node esbuild.js --production \
 && npm run build:webview \
 && npm pack --ignore-scripts --pack-destination /build

FROM node:22-bookworm-slim
COPY --from=build /build/pixel-agents-1.5.0.tgz /tmp/pixel-agents.tgz
RUN npm install -g /tmp/pixel-agents.tgz && rm /tmp/pixel-agents.tgz && npm cache clean --force
COPY scripts/smoke-ws.mjs /opt/trading/smoke-ws.mjs

ENV NODE_ENV=production
ENV HOME=/home/node

USER node
WORKDIR /home/node

EXPOSE 3100

CMD ["pixel-agents", "--host", "0.0.0.0", "--port", "3100", "--no-terminal"]
