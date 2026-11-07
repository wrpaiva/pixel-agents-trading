// Verificação somente leitura do escritório, para rodar DENTRO do container:
//   node /opt/trading/smoke-ws.mjs [ws://127.0.0.1:3100/ws] [segundos]
// Conecta como o navegador (sem token, portanto read-only), lista os personagens
// e imprime as mudanças de atividade até o prazo. Sai com 1 se faltar algum dos 7.
const url = process.argv[2] ?? 'ws://127.0.0.1:3100/ws';
const seconds = Number(process.argv[3] ?? 5);
const EXPECTED = [9001, 9002, 9003, 9004, 9005, 9006, 9007];
const names = new Map();
let agents = [];

const ws = new WebSocket(url);
ws.onopen = () => ws.send(JSON.stringify({ type: 'webviewReady' }));
ws.onerror = (e) => {
  console.error('erro no WebSocket:', e.message ?? e);
  process.exit(1);
};
ws.onmessage = ({ data }) => {
  let msg;
  try {
    msg = JSON.parse(String(data));
  } catch {
    return;
  }
  if (msg.type === 'existingAgents') agents = msg.agents;
  if (msg.type === 'agentTeamInfo') names.set(msg.id, msg.agentName);
  if (msg.type === 'agentToolStart' || msg.type === 'agentStatus' || msg.type === 'agentToolsClear') {
    const label = msg.status ? ` ${msg.status}` : '';
    console.log(`${new Date().toISOString()} ${names.get(msg.id) ?? msg.id}: ${msg.type}${label}`);
  }
};
setTimeout(() => {
  ws.close();
  console.log('\nPersonagens:', agents.map((id) => `${id}=${names.get(id) ?? '?'}`).join(', '));
  const missing = EXPECTED.filter((id) => !agents.includes(id));
  if (missing.length) {
    console.error('FALTANDO:', missing.join(', '));
    process.exit(1);
  }
  console.log('OK: 7 agentes presentes');
  process.exit(0);
}, seconds * 1000);
