import { consoleLogger, type Logger } from '../application/ports.js';
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../domain/TradingAgentSnapshot.js';
import { parseActivityPayload, parseSnapshotPayload, type ReceiverApiClient } from './ReceiverApiClient.js';

export interface SseMessage {
  event: string;
  data: string;
}

/** Parser incremental de text/event-stream (só os campos event e data; comentários ignorados). */
export class SseParser {
  private buffer = '';
  private event = 'message';
  private data: string[] = [];

  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        if (this.data.length > 0) out.push({ event: this.event, data: this.data.join('\n') });
        this.event = 'message';
        this.data = [];
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') this.event = value;
      else if (field === 'data') this.data.push(value);
    }
    return out;
  }
}

export interface ReceiverEventHandlers {
  onSnapshot(snapshots: TradingAgentSnapshot[]): void;
  onEvent(event: TradingAgentEvent): void;
  onConnectionLost(reason: string): void;
}

export interface ReceiverEventStreamOptions {
  client: Pick<ReceiverApiClient, 'openEvents'>;
  handlers: ReceiverEventHandlers;
  logger?: Logger;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Sem nenhum byte (nem o ": ping" do receptor) por esse tempo, a conexão é tratada como morta. */
  idleTimeoutMs?: number;
}

const IDLE_ABORT = 'idle-timeout';

/** Consome GET /events (SSE) do receptor e reconecta com backoff exponencial. */
export class ReceiverEventStream {
  private readonly logger: Logger;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly idleTimeoutMs: number;
  private stopped = true;
  private controller: AbortController | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private wake: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(private readonly options: ReceiverEventStreamOptions) {
    this.logger = options.logger ?? consoleLogger;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 75_000;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.controller?.abort();
    this.wake?.();
    await this.loop;
    this.loop = null;
  }

  private async run(): Promise<void> {
    let backoff = this.initialBackoffMs;
    while (!this.stopped) {
      const reason = await this.connectOnce(() => {
        backoff = this.initialBackoffMs;
      });
      if (this.stopped) break;
      this.options.handlers.onConnectionLost(reason);
      await this.sleep(backoff);
      backoff = Math.min(backoff * 2, this.maxBackoffMs);
    }
  }

  private async connectOnce(onHealthy: () => void): Promise<string> {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const res = await this.options.client.openEvents(controller.signal);
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        return `GET /events respondeu ${res.status}`;
      }
      const parser = new SseParser();
      const decoder = new TextDecoder();
      this.armIdle(controller);
      for await (const chunk of res.body) {
        this.armIdle(controller);
        for (const message of parser.push(decoder.decode(chunk, { stream: true }))) this.dispatch(message, onHealthy);
      }
      return 'stream encerrado pelo receptor';
    } catch (err) {
      if (controller.signal.reason === IDLE_ABORT) return `sem dados há ${this.idleTimeoutMs}ms`;
      return err instanceof Error ? err.message : String(err);
    } finally {
      this.clearIdle();
      this.controller = null;
    }
  }

  private dispatch(message: SseMessage, onHealthy: () => void): void {
    try {
      if (message.event === 'snapshot') {
        this.options.handlers.onSnapshot(parseSnapshotPayload(JSON.parse(message.data)));
        onHealthy();
      } else if (message.event === 'activity') {
        const event = parseActivityPayload(JSON.parse(message.data));
        if (event) this.options.handlers.onEvent(event);
        else this.logger.warn('[trading] evento "activity" inválido ignorado');
      }
    } catch (err) {
      this.logger.warn(`[trading] mensagem SSE "${message.event}" ignorada: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private armIdle(controller: AbortController): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => controller.abort(IDLE_ABORT), this.idleTimeoutMs);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wake = done;
    });
  }
}
