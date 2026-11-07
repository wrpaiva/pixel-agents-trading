# pixel-agents-trading

Pixel Agents 1.5.0 (subtree em `vendor/pixel-agents`) com a Trading Room: sete personagens nativos animados em tempo real pelos eventos do OpenClaw, publicado em Docker Swarm.

## Comandos

```bash
npm test                 # testes unitários e de integração (vitest)
npm run typecheck        # tsc --noEmit
npm run build:vendor     # compila o servidor e o webview do upstream
npm run e2e              # Playwright (exige build:vendor antes)
docker build -t pixel-agents-trading .
```

Uma tag `vX.Y.Z` publica a imagem `ghcr.io/wrpaiva/pixel-agents-trading:X.Y.Z`.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Contrato de eventos](docs/event-contract.md)
- [Publicação e rollback](docs/deployment.md)
