/**
 * Dados MOCKADOS de pontos de bagunça individuais (Fase 2 trocará por Supabase).
 * As fotos são ilustrações SVG geradas localmente, para funcionar offline.
 */

export interface MensagemPontoBagunca {
  autor: string;
  texto: string;
  hora: string;
}

export interface PontoBagunca {
  id: string;
  titulo: string;
  local: string;
  relator: string;
  criadaEm: string;
  status: 'aberta' | 'assumida';
  foto: string;
  mensagens: MensagemPontoBagunca[];
}

/** Gera uma foto de exemplo: fundo liso + duas formas planas. */
function foto(bg: string, a: string, b: string, variante: number): string {
  const formas = [
    `<rect x="40" y="150" width="220" height="14" fill="${a}"/><circle cx="150" cy="120" r="34" fill="${b}"/>`,
    `<rect x="70" y="70" width="90" height="120" rx="8" fill="${a}"/><rect x="170" y="110" width="70" height="80" rx="8" fill="${b}"/>`,
    `<circle cx="100" cy="120" r="46" fill="${a}"/><rect x="150" y="90" width="110" height="70" rx="6" fill="${b}"/>`,
    `<rect x="30" y="160" width="240" height="10" fill="${a}"/><rect x="110" y="60" width="80" height="100" rx="40" fill="${b}"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 225"><rect width="300" height="225" fill="${bg}"/>${formas[variante % formas.length]}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const pontosBaguncaMock: PontoBagunca[] = [
  {
    id: 'o1', titulo: 'Copo deixado na mesa', local: 'Varanda', relator: 'Caixinha',
    criadaEm: 'hoje, 09:40', status: 'aberta', foto: foto('#d9d6c5', '#b4532f', '#f6e5dc', 0),
    mensagens: [
      { autor: 'Caixinha', texto: 'Esse copo está aí desde ontem à noite.', hora: '09:42' },
      { autor: 'Jumento', texto: 'Não é meu, tomei só água no quarto.', hora: '10:05' },
    ],
  },
  {
    id: 'o2', titulo: 'Tênis no meio da sala', local: 'Sala', relator: 'Valéria',
    criadaEm: 'hoje, 08:15', status: 'aberta', foto: foto('#cfd8c0', '#0a6b24', '#e7f2cc', 1),
    mensagens: [{ autor: 'Valéria', texto: 'Quase tropecei nele.', hora: '08:16' }],
  },
  {
    id: 'o3', titulo: 'Louça acumulada', local: 'Cozinha', relator: 'Ganso',
    criadaEm: 'ontem, 22:30', status: 'aberta', foto: foto('#e0dccb', '#66726a', '#68c100', 2),
    mensagens: [
      { autor: 'Ganso', texto: 'Pia cheia de novo.', hora: '22:31' },
      { autor: 'Cachorrão', texto: 'Era do jantar de ontem, foi mal, lavo já.', hora: '22:50' },
      { autor: 'Ganso', texto: 'Então assume o ponto aí.', hora: '22:52' },
    ],
  },
  {
    id: 'o4', titulo: 'Toalha molhada na cama', local: 'Quarto do Meio', relator: 'Cachorrão',
    criadaEm: 'ontem, 14:10', status: 'aberta', foto: foto('#d3d0c0', '#16241b', '#b4532f', 3),
    mensagens: [],
  },
  {
    id: 'o5', titulo: 'Bicicleta na garagem', local: 'Garagem', relator: 'Jumento',
    criadaEm: '2 dias atrás', status: 'aberta', foto: foto('#c9d3bb', '#f6e5dc', '#0a6b24', 0),
    mensagens: [{ autor: 'Jumento', texto: 'Está atrapalhando o carro.', hora: '18:20' }],
  },
  {
    id: 'o6', titulo: 'Lixo transbordando', local: 'Área de serviço', relator: 'Bixo 026',
    criadaEm: '2 dias atrás', status: 'aberta', foto: foto('#ddd9c7', '#68c100', '#66726a', 1),
    mensagens: [],
  },
  {
    id: 'o7', titulo: 'Roupa esquecida no varal', local: 'Quintal', relator: 'Caixinha',
    criadaEm: '3 dias atrás', status: 'aberta', foto: foto('#d6dcc6', '#b4532f', '#16241b', 2),
    mensagens: [{ autor: 'Caixinha', texto: 'Choveu e continua lá.', hora: '16:00' }],
  },
  // Já assumidas: NÃO aparecem no carrossel (só pendentes).
  {
    id: 'o8', titulo: 'Panela esquecida no fogão', local: 'Cozinha', relator: 'Valéria',
    criadaEm: '4 dias atrás', status: 'assumida', foto: foto('#d9d6c5', '#66726a', '#e7f2cc', 3),
    mensagens: [],
  },
  {
    id: 'o9', titulo: 'Luz do banheiro acesa', local: 'Banheiro', relator: 'Ganso',
    criadaEm: '5 dias atrás', status: 'assumida', foto: foto('#cfd8c0', '#16241b', '#68c100', 0),
    mensagens: [],
  },
];
