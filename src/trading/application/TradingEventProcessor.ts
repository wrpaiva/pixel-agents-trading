import { ACTIVE_STATUSES } from '../domain/AgentStatus.js';
import type { TradingAgent } from '../domain/TradingAgent.js';
import type { TradingAgentEvent } from '../domain/TradingAgentEvent.js';
import type { TradingAgentSnapshot } from '../domain/TradingAgentSnapshot.js';
import { AgentStateMapper } from './AgentStateMapper.js';
import { type Clock, consoleLogger, type Logger, systemClock } from './ports.js';
import type { AgentPatch, TradingAgentRegistry } from './TradingAgentRegistry.js';

export type AgentChangeListener = (agent: TradingAgent, previous: TradingAgent) => void;

export interface TradingEventProcessorOptions {
  registry: TradingAgentRegistry;
  mapper?: AgentStateMapper;
  clock?: Clock;
  logger?: Logger;
  /** Quanto tempo "completed" fica visível antes de voltar a idle. */
  completedHoldMs?: number;
  /** Quanto tempo "error" fica visível (o receptor também expira após 2 min). */
  errorHoldMs?: number;
  /** Sem eventos por esse tempo, um agente ativo volta a idle. */
  staleActiveMs?: number;
}

interface Tracking {
  lastSeq: number | null;
  lastTs: number | null;
  keysAtLastTs: Set<string>;
  lastActivityAt: number;
  statusSince: number;
}

const eventKey = (e: TradingAgentEvent) => `${e.eventType}|${e.sessionKey ?? ''}|${e.toolName ?? ''}`;

/** Aplica snapshots e eventos do receptor ao registry e notifica quem desenha o escritório. */
export class TradingEventProcessor {
  private readonly registry: TradingAgentRegistry;
  private readonly mapper: AgentStateMapper;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly completedHoldMs: number;
  private readonly errorHoldMs: number;
  private readonly staleActiveMs: number;
  private readonly listeners = new Set<AgentChangeListener>();
  private readonly tracking = new Map<string, Tracking>();

  constructor(options: TradingEventProcessorOptions) {
    this.registry = options.registry;
    this.mapper = options.mapper ?? new AgentStateMapper();
    this.clock = options.clock ?? systemClock;
    this.logger = options.logger ?? consoleLogger;
    this.completedHoldMs = options.completedHoldMs ?? 4000;
    this.errorHoldMs = options.errorHoldMs ?? 120_000;
    this.staleActiveMs = options.staleActiveMs ?? 180_000;
  }

  subscribe(listener: AgentChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Estado completo do receptor: redefine a linha de base (inclusive seq, que zera quando ele reinicia). */
  applySnapshot(snapshots: TradingAgentSnapshot[]): void {
    const now = this.clock.now();
    for (const snap of snapshots) {
      if (!this.registry.isKnown(snap.agentId)) {
        this.logger.warn(`[trading] snapshot ignorado: agente desconhecido "${snap.agentId}"`);
        continue;
      }
      const status = this.mapper.fromReceiverState(snap.receiverState);
      const lastTs = snap.lastSeen ? Date.parse(snap.lastSeen) : NaN;
      const track = this.track(snap.agentId);
      track.lastSeq = snap.seq;
      track.lastTs = Number.isNaN(lastTs) ? null : lastTs;
      track.keysAtLastTs = new Set();
      track.lastActivityAt = Number.isNaN(lastTs) ? now : Math.min(lastTs, now);
      this.transition(snap.agentId, {
        status,
        sessionKey: snap.sessionKey,
        lastEvent: snap.lastEvent,
        lastSeen: snap.lastSeen,
        toolName: status === 'using_tool' ? snap.toolName : null,
        eventCount: snap.count,
      });
    }
  }

  applyEvent(event: TradingAgentEvent): boolean {
    if (!this.registry.isKnown(event.agentId)) {
      this.logger.warn(`[trading] evento ignorado: agente desconhecido "${event.agentId}"`);
      return false;
    }
    const ts = Date.parse(event.timestamp);
    if (Number.isNaN(ts)) {
      this.logger.warn(`[trading] evento ignorado: timestamp inválido para ${event.agentId}`);
      return false;
    }
    const track = this.track(event.agentId);
    const seq = event.seq ?? null;
    const key = eventKey(event);
    if (seq !== null && track.lastSeq !== null) {
      if (seq <= track.lastSeq) return false; // duplicado ou atrasado
    } else if (track.lastTs !== null) {
      if (ts < track.lastTs) return false; // atrasado
      if (ts === track.lastTs && track.keysAtLastTs.has(key)) return false; // duplicado
    }

    const agent = this.registry.get(event.agentId)!;
    const status = this.mapper.fromEvent(agent.status, event);
    if (status === null) {
      this.logger.warn(`[trading] evento ignorado: tipo desconhecido "${event.eventType}" (${event.agentId})`);
      return false;
    }

    if (seq !== null) track.lastSeq = seq;
    if (track.lastTs !== ts) track.keysAtLastTs = new Set();
    track.lastTs = ts;
    track.keysAtLastTs.add(key);
    track.lastActivityAt = this.clock.now();

    this.transition(event.agentId, {
      status,
      sessionKey: event.sessionKey,
      lastEvent: event.eventType,
      lastSeen: event.timestamp,
      toolName: status === 'using_tool' ? (event.toolName ?? null) : null,
      eventCount: agent.eventCount + 1,
    });
    return true;
  }

  /** Receptor inacessível além do limite: diferente de idle. */
  markDisconnected(): void {
    for (const agent of this.registry.all()) {
      if (agent.status !== 'disconnected') this.transition(agent.agentId, { status: 'disconnected', toolName: null });
    }
  }

  /** Expirações baseadas em tempo; chamado periodicamente pelo bootstrap. */
  tick(): void {
    const now = this.clock.now();
    for (const agent of this.registry.all()) {
      const track = this.track(agent.agentId);
      if (agent.status === 'completed' && now - track.statusSince >= this.completedHoldMs) {
        this.transition(agent.agentId, { status: 'idle' });
      } else if (agent.status === 'error' && now - track.statusSince >= this.errorHoldMs) {
        this.transition(agent.agentId, { status: 'idle' });
      } else if (ACTIVE_STATUSES.has(agent.status) && now - track.lastActivityAt >= this.staleActiveMs) {
        this.logger.info(`[trading] ${agent.agentId}: sem eventos há ${Math.round((now - track.lastActivityAt) / 1000)}s, voltando a idle`);
        this.transition(agent.agentId, { status: 'idle', toolName: null });
      }
    }
  }

  private track(agentId: string): Tracking {
    let track = this.tracking.get(agentId);
    if (!track) {
      const now = this.clock.now();
      track = { lastSeq: null, lastTs: null, keysAtLastTs: new Set(), lastActivityAt: now, statusSince: now };
      this.tracking.set(agentId, track);
    }
    return track;
  }

  private transition(agentId: string, patch: AgentPatch): void {
    const previous = this.registry.get(agentId)!;
    const next = this.registry.update(agentId, patch);
    if (next.status !== previous.status) this.track(agentId).statusSince = this.clock.now();
    if (next.status === previous.status && next.toolName === previous.toolName) return;
    for (const listener of this.listeners) listener(next, previous);
  }
}
