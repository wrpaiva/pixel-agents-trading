import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReplaySend } from '../../../vendor/pixel-agents/server/src/activityReplayers.js';
import { createAgentState } from '../../../vendor/pixel-agents/server/src/agentState.js';
import type { AgentStateStore } from '../../../vendor/pixel-agents/server/src/agentStateStore.js';
import type { AgentState } from '../../../vendor/pixel-agents/server/src/types.js';
import { consoleLogger, type Logger } from '../application/ports.js';
import type { TradingAgentRegistry } from '../application/TradingAgentRegistry.js';
import type { TradingEventProcessor } from '../application/TradingEventProcessor.js';
import type { TradingAgentDefinition } from '../config/agents.js';
import type { AgentStatus } from '../domain/AgentStatus.js';
import type { TradingAgent } from '../domain/TradingAgent.js';

export type OfficeStore = Pick<AgentStateStore, 'has' | 'get' | 'set' | 'broadcast' | 'persist' | 'on' | 'off'>;
export type AddReplayer = (replay: (send: ReplaySend) => void) => () => void;

export const OPENCLAW_PROVIDER_ID = 'openclaw';
/** Uma única "ferramenta" sintética por agente carrega o rótulo da atividade. */
export const ACTIVITY_TOOL_ID = 'openclaw-activity';
const ANALYSIS_TOOL_NAME = 'OpenClawAnalysis';
const PROJECT_DIR = 'openclaw-trading';
/** Estados com rótulo mas sem animação. */
const LABELED_INACTIVE: ReadonlySet<AgentStatus> = new Set<AgentStatus>(['waiting', 'error', 'disconnected']);

export function activityLabel(agent: TradingAgent): string | null {
  switch (agent.status) {
    case 'analyzing':
      return 'Analisando';
    case 'using_tool':
      return agent.toolName ? `Ferramenta: ${agent.toolName}` : 'Usando ferramenta';
    case 'waiting':
      return 'Aguardando dependência';
    case 'error':
      return 'Erro na execução';
    case 'disconnected':
      return 'Sem conexão com o receptor';
    default:
      return null;
  }
}

export interface OpenClawProviderOptions {
  store: OfficeStore;
  registry: TradingAgentRegistry;
  processor: TradingEventProcessor;
  addReplayer: AddReplayer;
  /** Diretório dos arquivos-marcador (um .jsonl vazio por agente). */
  markerDir: string;
  logger?: Logger;
}

/**
 * Projeta os sete agentes do OpenClaw como personagens nativos do Pixel Agents:
 * AgentState no store (persistido, reenviado a cada webviewReady) e as mesmas
 * mensagens WebSocket que o provider Claude usa. Não há caminho de volta ao OpenClaw.
 */
export class OpenClawProvider {
  private readonly logger: Logger;
  private unsubscribe: (() => void) | null = null;
  private removeReplayer: (() => void) | null = null;

  constructor(private readonly options: OpenClawProviderOptions) {
    this.logger = options.logger ?? consoleLogger;
  }

  start(): void {
    if (this.unsubscribe) return;
    for (const def of this.options.registry.definitions()) this.ensureAgent(def);
    this.options.store.persist();
    this.unsubscribe = this.options.processor.subscribe((agent) => this.render(agent));
    this.removeReplayer = this.options.addReplayer((send) => this.replay(send));
    this.options.store.on('agentRemoved', this.onAgentRemoved);
    for (const agent of this.options.registry.all()) this.render(agent);
  }

  stop(): void {
    this.unsubscribe?.();
    this.removeReplayer?.();
    this.options.store.off('agentRemoved', this.onAgentRemoved);
    this.unsubscribe = null;
    this.removeReplayer = null;
  }

  private ensureAgent(def: TradingAgentDefinition): void {
    const { store, markerDir } = this.options;
    const existing = store.get(def.officeId);
    if (existing) {
      if (existing.providerId !== OPENCLAW_PROVIDER_ID) {
        throw new Error(`[trading] id ${def.officeId} reservado para ${def.agentId} já está em uso por outro agente`);
      }
      return;
    }
    // Agentes externos sem arquivo de transcript são removidos pela checagem "stale"
    // do upstream; um marcador vazio mantém o personagem vivo. Nada é escrito nele.
    mkdirSync(markerDir, { recursive: true });
    const marker = join(markerDir, `${def.agentId}.jsonl`);
    if (!existsSync(marker)) writeFileSync(marker, '');
    store.set(
      def.officeId,
      createAgentState({
        id: def.officeId,
        sessionId: `${OPENCLAW_PROVIDER_ID}:${def.agentId}`,
        isExternal: true,
        hooksOnly: true,
        providerId: OPENCLAW_PROVIDER_ID,
        projectDir: PROJECT_DIR,
        jsonlFile: marker,
        directoryName: def.agentId,
        agentName: def.displayName,
        palette: def.palette,
        hueShift: def.hueShift,
      }),
    );
  }

  private render(agent: TradingAgent): void {
    const def = this.options.registry.definition(agent.agentId);
    const state = def ? this.options.store.get(def.officeId) : undefined;
    if (!def || !state) return;
    const { store } = this.options;
    const id = def.officeId;
    const label = activityLabel(agent);

    clearTools(state);
    state.isWaiting = false;
    store.broadcast({ type: 'agentToolsClear', id });

    if (label) {
      const toolName = agent.status === 'using_tool' ? (agent.toolName ?? 'tool') : ANALYSIS_TOOL_NAME;
      state.activeToolIds.add(ACTIVITY_TOOL_ID);
      state.activeToolStatuses.set(ACTIVITY_TOOL_ID, label);
      state.activeToolNames.set(ACTIVITY_TOOL_ID, toolName);
      store.broadcast({ type: 'agentToolStart', id, toolId: ACTIVITY_TOOL_ID, status: label, toolName });
    }

    if (agent.status === 'analyzing' || agent.status === 'using_tool') {
      store.broadcast({ type: 'agentStatus', id, status: 'active' });
    } else if (agent.status === 'completed') {
      state.isWaiting = true;
      store.broadcast({ type: 'agentStatus', id, status: 'waiting', awaitingInput: false });
    } else {
      // Qualquer status diferente de 'active' desativa a animação sem balão nem som.
      store.broadcast({ type: 'agentStatus', id, status: 'idle' });
    }
  }

  /** resendAgentActivity reenvia nossa "ferramenta", o que reativa a animação; desfazemos para estados parados. */
  private replay(send: ReplaySend): void {
    for (const agent of this.options.registry.all()) {
      const def = this.options.registry.definition(agent.agentId);
      if (def && LABELED_INACTIVE.has(agent.status)) send({ type: 'agentStatus', id: def.officeId, status: 'idle' });
    }
  }

  private readonly onAgentRemoved = (id: number): void => {
    const def = this.options.registry.definitions().find((d) => d.officeId === id);
    if (!def || !this.unsubscribe) return;
    this.logger.warn(`[trading] personagem ${def.agentId} removido; recriando`);
    // Fora do fluxo de remoção do runtime, que ainda está em andamento.
    setImmediate(() => {
      if (!this.unsubscribe || this.options.store.has(id)) return;
      this.ensureAgent(def);
      this.options.store.broadcast({ type: 'agentTeamInfo', id, agentName: def.displayName });
      this.render(this.options.registry.get(def.agentId)!);
      this.options.store.persist();
    });
  };
}

function clearTools(state: AgentState): void {
  state.activeToolIds.clear();
  state.activeToolStatuses.clear();
  state.activeToolNames.clear();
}
