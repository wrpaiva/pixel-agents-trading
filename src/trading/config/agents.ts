export interface TradingAgentDefinition {
  agentId: string;
  displayName: string;
  role: string;
  /** Id numérico do personagem no AgentStateStore. Fixo: mantém cadeira e cor entre reinícios. */
  officeId: number;
  /** Paleta do personagem (0-5) e rotação de cor, fixas por agente. */
  palette: number;
  hueShift: number;
  /** uid do banco da estação em trading-room/layout.json; sem esse móvel, o webview escolhe uma cadeira livre. */
  seatId: string;
}

export const TRADING_AGENTS: readonly TradingAgentDefinition[] = [
  { agentId: 'trading-coordinator', displayName: 'Coordinator', role: 'Orquestração', officeId: 9001, palette: 0, hueShift: 0, seatId: 'seat-trading-coordinator' },
  { agentId: 'crypto-btc', displayName: 'BTC Analyst', role: 'Criptomoedas', officeId: 9002, palette: 1, hueShift: 0, seatId: 'seat-crypto-btc' },
  { agentId: 'crypto-eth', displayName: 'ETH Analyst', role: 'Criptomoedas', officeId: 9003, palette: 2, hueShift: 0, seatId: 'seat-crypto-eth' },
  { agentId: 'forex-eur', displayName: 'EUR Analyst', role: 'Forex', officeId: 9004, palette: 3, hueShift: 0, seatId: 'seat-forex-eur' },
  { agentId: 'forex-gbp', displayName: 'GBP Analyst', role: 'Forex', officeId: 9005, palette: 4, hueShift: 0, seatId: 'seat-forex-gbp' },
  { agentId: 'gold-analyst', displayName: 'Gold Analyst', role: 'Ouro', officeId: 9006, palette: 5, hueShift: 0, seatId: 'seat-gold-analyst' },
  { agentId: 'risk-reviewer', displayName: 'Risk Reviewer', role: 'Gestão de risco', officeId: 9007, palette: 0, hueShift: 180, seatId: 'seat-risk-reviewer' },
];
