/**
 * Mapeamento Canônico Centralizado de Numeração dos Comandos (Fonte Única da Verdade).
 * Garante ordem determinística e atalhos numéricos (/1 a /33) idênticos em qualquer ambiente (Windows/Linux/Docker).
 */

const COMMAND_NUMBER_MAP = {
  // 1 a 8: Módulos do Painel / Wizard / Moderação Automática
  '1': 'antifake',
  '2': 'antiflood',
  '3': 'antilink',
  '4': 'automsg',
  '5': 'ban',
  '6': 'schedule',
  '7': 'warn',
  '8': 'welcome',

  // 9 a 18: Comandos Utilitários e Moderação do Grupo
  '9': 'hidetag',
  '10': 'promote',
  '11': 'demote',
  '12': 'mute',
  '13': 'del',
  '14': 'sortear',
  '15': 'blacklist',
  '16': 'idioma',
  '17': 'ping',
  '18': 'menu',

  // 19 a 23: Comandos do Dono / SaaS (Privado)
  '19': 'bot',
  '20': 'autoadm',
  '21': 'bangrupo',
  '22': 'reload',
  '23': 'liberar',

  // 24 a 33: Ferramentas Avançadas, Mídias e Agente IA
  '24': 'autoapprove',
  '25': 'setpic',
  '26': 'pin',
  '27': 'poll',
  '28': 'calendar',
  '29': 'config',
  '30': 'link',
  '31': 'mutemember',
  '32': 'setdesc',
  '33': 'hermes'
};

/**
 * Retorna o mapa canônico de número -> nome do comando
 * @returns {Record<string, string>}
 */
function getCommandNumberMap() {
  return { ...COMMAND_NUMBER_MAP };
}

/**
 * Retorna o número canônico de um comando pelo nome principal
 * @param {string} commandName 
 * @returns {number|null}
 */
function getNumberForCommand(commandName) {
  if (!commandName) return null;
  const name = String(commandName).toLowerCase();
  for (const [num, cmd] of Object.entries(COMMAND_NUMBER_MAP)) {
    if (cmd.toLowerCase() === name) return parseInt(num, 10);
  }
  return null;
}

module.exports = {
  COMMAND_NUMBER_MAP,
  getCommandNumberMap,
  getNumberForCommand
};
