import { join } from 'node:path';

import { consoleLogger, type Logger } from '../application/ports.js';
import { TradingAgentRegistry } from '../application/TradingAgentRegistry.js';
import { TradingEventProcessor } from '../application/TradingEventProcessor.js';
import { ReceiverApiClient } from '../infrastructure/ReceiverApiClient.js';
import { ReceiverEventStream } from '../infrastructure/ReceiverEventStream.js';
import { readSecretFile } from '../infrastructure/SecretProvider.js';
import { type AddReplayer, type OfficeStore, OpenClawProvider } from '../providers/OpenClawProvider.js';

export interface RegisterTradingProviderOptions {
  store: OfficeStore;
  addReplayer: AddReplayer;
  /** ~/.pixel-agents — os marcadores ficam em <dataDir>/openclaw. */
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
}

export interface TradingRoomHandle {
  stop(): Promise<void>;
}

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Liga a Trading Room ao servidor do Pixel Agents. Falhas do receptor só mudam
 * o que o escritório mostra; nunca interrompem o servidor nem tocam no OpenClaw.
 */
export function registerTradingProvider(options: RegisterTradingProviderOptions): TradingRoomHandle {
  const env = options.env ?? process.env;
  const logger = options.logger ?? consoleLogger;
  const baseUrl = env.PIXEL_EVENTS_RECEIVER_URL ?? 'http://pixel-events_receiver:3188';
  const tokenFile = env.PIXEL_EVENTS_TOKEN_FILE ?? '/run/secrets/pixel_events_token';
  const disconnectAfterMs = numberFrom(env.PIXEL_EVENTS_DISCONNECT_AFTER_MS, 30_000);

  const registry = new TradingAgentRegistry();
  const processor = new TradingEventProcessor({
    registry,
    logger,
    staleActiveMs: numberFrom(env.PIXEL_EVENTS_STALE_ACTIVE_MS, 180_000),
  });
  const provider = new OpenClawProvider({
    store: options.store,
    registry,
    processor,
    addReplayer: options.addReplayer,
    markerDir: join(options.dataDir, 'openclaw'),
    logger,
  });
  provider.start();

  const token = readSecretFile(tokenFile);
  if (!token) {
    logger.warn(`[trading] token do receptor ausente ou inválido em ${tokenFile}; agentes exibidos como desconectados`);
    return { stop: async () => provider.stop() };
  }

  const client = new ReceiverApiClient({ baseUrl, token });
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelDisconnect = () => {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = null;
  };
  const stream = new ReceiverEventStream({
    client,
    logger,
    initialBackoffMs: numberFrom(env.PIXEL_EVENTS_RETRY_MS, 1000),
    handlers: {
      onSnapshot: (snapshots) => {
        cancelDisconnect();
        processor.applySnapshot(snapshots);
      },
      onEvent: (event) => processor.applyEvent(event),
      onConnectionLost: (reason) => {
        logger.warn(`[trading] conexão com o receptor perdida: ${reason}`);
        disconnectTimer ??= setTimeout(() => processor.markDisconnected(), disconnectAfterMs);
      },
    },
  });

  let stopped = false;
  // Snapshot inicial antes dos eventos incrementais; o SSE reenvia um snapshot a cada conexão.
  void client
    .getAgents()
    .then((snapshots) => {
      if (!stopped) processor.applySnapshot(snapshots);
    })
    .catch((err: unknown) => logger.warn(`[trading] snapshot inicial indisponível: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => {
      if (!stopped) stream.start();
    });

  const ticker = setInterval(() => processor.tick(), 1000);
  ticker.unref();
  logger.info(`[trading] Trading Room ativa: 7 agentes, receptor ${baseUrl}`);

  return {
    async stop() {
      stopped = true;
      clearInterval(ticker);
      cancelDisconnect();
      await stream.stop();
      provider.stop();
    },
  };
}
