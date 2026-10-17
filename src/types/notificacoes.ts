export type NotificationCategory =
  | 'ponto_bagunca'
  | 'quadro_faxina'
  | 'chat_frente'
  | 'funca'
  | 'mercado'
  | 'dogs'
  | 'misturas'
  | 'cerveja'
  | 'admin';

export type NotificationTargetScreen =
  | 'home'
  | 'misturas'
  | 'quadro'
  | 'funcas'
  | 'frentes'
  | 'cervejas'
  | 'aprovacoes';

export type NotificationUrgency = 'urgent' | 'normal' | 'info';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: string; // ISO string
  read: boolean;
  urgency: NotificationUrgency;
  targetScreen: NotificationTargetScreen;
  targetParams?: Record<string, any>;
}

export interface BrasiliaDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  dateStr: string; // YYYY-MM-DD
}

/**
 * Retorna os componentes da data e horário atuais no fuso de Brasília (America/Sao_Paulo).
 */
export function getBrasiliaDateParts(date: Date = new Date()): BrasiliaDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0';

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, hour, minute, dateStr };
}

/**
 * Gatilho 2: Ponto de bagunça prestes a expirar em <= 1h (60 min) das 24h.
 */
export function shouldNotifyPontoExpiring1h(
  createdAtIso: string,
  agora: Date = new Date()
): { shouldNotify: boolean; minutesRemaining: number; label: string } {
  const criacao = new Date(createdAtIso).getTime();
  const limite = criacao + 24 * 60 * 60 * 1000;
  const diferencaMs = limite - agora.getTime();

  // Expira em <= 60 minutos e ainda não expirou (> 0ms)
  const shouldNotify = diferencaMs > 0 && diferencaMs <= 60 * 60 * 1000;
  const minutesRemaining = Math.max(1, Math.floor(diferencaMs / (60 * 1000)));

  return {
    shouldNotify,
    minutesRemaining,
    label: shouldNotify
      ? `Expira em ${minutesRemaining} min`
      : diferencaMs <= 0
      ? 'Expirado'
      : 'Mais de 1h restante',
  };
}

/**
 * Gatilho 5: Quarto escalado na faxina a <= 1h do corte das 01:00 BRT (ou seja, entre 00:00 e 00:59 BRT).
 */
export function shouldNotifyFaxina01h(
  agora: Date = new Date(),
  params: { isEscaladoHoje: boolean; jaEnviouFotoHoje: boolean } = {
    isEscaladoHoje: false,
    jaEnviouFotoHoje: false,
  }
): { shouldNotify: boolean; label: string } {
  const { hour } = getBrasiliaDateParts(agora);
  const isJanela00h = hour === 0; // 00:00 a 00:59 BRT
  const shouldNotify = isJanela00h && params.isEscaladoHoje && !params.jaEnviouFotoHoje;

  return {
    shouldNotify,
    label: shouldNotify
      ? 'Falta menos de 1h para o corte das 01:00h da faxina!'
      : 'Fora da janela de corte de faxina',
  };
}

/**
 * Gatilho 7: Quarto Halls (Fiscal) a <= 1h do corte das 11:00 BRT (ou seja, entre 10:00 e 10:59 BRT).
 */
export function shouldNotifyHalls11h(
  agora: Date = new Date(),
  params: { isFiscal: boolean; temFotosPendentesOntem: boolean } = {
    isFiscal: false,
    temFotosPendentesOntem: false,
  }
): { shouldNotify: boolean; label: string } {
  const { hour } = getBrasiliaDateParts(agora);
  const isJanela10h = hour === 10; // 10:00 a 10:59 BRT
  const shouldNotify = isJanela10h && params.isFiscal && params.temFotosPendentesOntem;

  return {
    shouldNotify,
    label: shouldNotify
      ? 'Falta menos de 1h para o corte das 11:00h da fiscalização do Halls!'
      : 'Fora da janela de fiscalização do Halls',
  };
}

/**
 * Gatilho 18: Lembrete diário da Folha de Misturas (15:00h Almoço e 21:00h Janta BRT).
 */
export function shouldNotifyMisturas15hOr21h(
  agora: Date = new Date(),
  params: { misturasConsumidasHoje: number | null } = {
    misturasConsumidasHoje: null,
  }
): {
  shouldNotify: boolean;
  window: 'almoco' | 'janta' | null;
  message: string;
} {
  const { hour } = getBrasiliaDateParts(agora);
  const consumidas = params.misturasConsumidasHoje ?? 0;

  // Janela do almoço: a partir das 15:00 até 20:59 BRT
  if (hour >= 15 && hour < 21) {
    if (consumidas === 0) {
      return {
        shouldNotify: true,
        window: 'almoco',
        message: '🍽️ Misturas (15h): Você ainda não marcou o almoço na Folha de Misturas de hoje!',
      };
    }
  }

  // Janela da janta: a partir das 21:00 BRT até 23:59 BRT
  if (hour >= 21) {
    if (consumidas < 1.0) {
      return {
        shouldNotify: true,
        window: 'janta',
        message: '🍽️ Misturas (21h): Lembre-se de marcar a janta na Folha de Misturas de hoje!',
      };
    }
  }

  return {
    shouldNotify: false,
    window: null,
    message: '',
  };
}

/**
 * Gatilho 17: Frente Dogs - Alerta de refeição pendente às 11:00h (Manhã) e 21:00h (Noite) BRT.
 */
export function shouldNotifyDogs11hOr21h(
  agora: Date = new Date(),
  params: {
    isMemberOrAdmin: boolean;
    refeicaoManhaFeita: boolean;
    refeicaoNoiteFeita: boolean;
  } = {
    isMemberOrAdmin: false,
    refeicaoManhaFeita: false,
    refeicaoNoiteFeita: false,
  }
): {
  shouldNotify: boolean;
  window: 'manha' | 'noite' | null;
  message: string;
} {
  if (!params.isMemberOrAdmin) {
    return { shouldNotify: false, window: null, message: '' };
  }

  const { hour } = getBrasiliaDateParts(agora);

  // Janela da manhã: 11:00 a 14:59 BRT
  if (hour >= 11 && hour < 15) {
    if (!params.refeicaoManhaFeita) {
      return {
        shouldNotify: true,
        window: 'manha',
        message: '🐶 Dogs (11h): A refeição da manhã dos cães ainda não foi registrada hoje!',
      };
    }
  }

  // Janela da noite: a partir das 21:00 BRT
  if (hour >= 21) {
    if (!params.refeicaoNoiteFeita) {
      return {
        shouldNotify: true,
        window: 'noite',
        message: '🐶 Dogs (21h): A refeição da noite dos cães ainda não foi registrada hoje!',
      };
    }
  }

  return {
    shouldNotify: false,
    window: null,
    message: '',
  };
}

/**
 * Gatilho 13: Verificação do status de prazo de funça.
 */
export function checkPrazoFunca(
  prazoStr: string | null | undefined,
  hojeStr: string
): 'atrasada' | 'hoje' | 'futura' | null {
  if (!prazoStr) return null;
  if (prazoStr < hojeStr) return 'atrasada';
  if (prazoStr === hojeStr) return 'hoje';
  return 'futura';
}

/**
 * Formata timestamp relativo simples e amigável para notificações.
 */
export function formatNotificationRelativeTime(
  timestampIso: string,
  agora: Date = new Date()
): string {
  try {
    const data = new Date(timestampIso);
    const diffMs = agora.getTime() - data.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `Há ${diffMin} min`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Há ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `Há ${diffDays} dias`;

    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
  } catch {
    return '';
  }
}

export interface NotificationEvaluationContext {
  currentUser: {
    id: string;
    nome?: string;
    apelido?: string | null;
    role?: 'admin' | 'morador' | 'externo';
    ativo?: boolean;
    quarto_id?: string | null;
  } | null;
  agora?: Date;
  readNotificationIds?: Set<string>;

  // 1 & 2. Pontos de Bagunça
  pontosBagunca?: Array<{
    id: string;
    relator_id: string;
    culpado_id?: string | null;
    local_descricao: string;
    status: 'aberta' | 'assumida';
    created_at: string;
  }>;
  visualizacoesIds?: Set<string>;
  pontosMensagens?: Array<{
    id: string;
    ponto_bagunca_id: string;
    autor_id: string;
    conteudo: string;
    enviada_em: string;
    autor_apelido?: string | null;
    ponto_local_descricao?: string;
  }>;
  pontosIndividuaisCreditados?: Array<{
    id: string;
    local_descricao: string;
    totalPontosMes?: number;
  }>;

  // Quadro & Faxina
  quartoFiscalId?: string | null;
  escalasQuarto?: {
    semana_ano: number;
    pontos_faltas: number;
    area_nome?: string;
    isEscaladoHoje?: boolean;
    jaEnviouFotoHoje?: boolean;
  } | null;
  tarefasFiscalPendenteOntem?: Array<{
    id: string;
    quarto_nome?: string;
    area_nome?: string;
  }>;
  novasFotosFiscalHoje?: Array<{
    id: string;
    quarto_nome: string;
    area_nome: string;
  }>;
  pontosFaltaRecebidos?: Array<{
    id: string;
    motivo: string;
    totalFaltasSemana: number;
  }>;

  // Frentes & Chats
  userFrontIds?: Set<string>;
  frontsMap?: Record<string, { id: string; nome: string; slug: string }>;
  mensagensFrente?: Array<{
    id: string;
    frente_id: string;
    autor_id: string;
    conteudo: string;
    enviada_em: string;
    autor_apelido?: string | null;
    frente_nome?: string;
  }>;
  alocacoesFrente?: Array<{
    front_id: string;
    frente_nome: string;
    is_lider: boolean;
    data_inicio: string;
  }>;

  // Funcas
  minhasFuncasAtribuidas?: Array<{
    id: string;
    titulo: string;
    status: 'aberta' | 'em_andamento';
    prazo?: string | null;
  }>;
  novasFuncasNaMinhaFrente?: Array<{
    id: string;
    frente_id: string;
    frente_nome: string;
    titulo: string;
    relator_id: string;
  }>;
  pedidosTrocaRecebidos?: Array<{
    funca_id: string;
    titulo: string;
    solicitante_apelido: string;
  }>;
  respostasTroca?: Array<{
    funca_id: string;
    titulo: string;
    aceito: boolean;
  }>;

  // Mercado
  solicitacoesMercado?: Array<{
    id: string;
    item_nome: string;
    solicitante_apelido: string;
    solicitado_por: string;
  }>;

  // Dogs
  dogsRefeicaoManhaHojeFeita?: boolean;
  dogsRefeicaoNoiteHojeFeita?: boolean;

  // Misturas
  minhasMisturasHoje?: number | null;

  // Cervejas
  minhasCaixasAtribuidas?: Array<{
    id: string;
    motivo_descricao: string;
    status: 'pendente' | 'baixa_solicitada' | 'paga';
  }>;
  respostasBaixaCerveja?: Array<{
    id: string;
    motivo_descricao: string;
    aprovada: boolean;
  }>;

  // Admin
  perfisAguardandoAprovacaoCount?: number;
  solicitacoesBaixaCervejaAdminCount?: number;
}

/**
 * Deriva a lista consolidada de notificações do usuário com base nos 20 gatilhos oficiais.
 */
export function deriveNotifications(ctx: NotificationEvaluationContext): AppNotification[] {
  const notifications: AppNotification[] = [];
  const agora = ctx.agora || new Date();
  const { dateStr } = getBrasiliaDateParts(agora);
  const userId = ctx.currentUser?.id;
  const isAdmin = ctx.currentUser?.role === 'admin';
  const readSet = ctx.readNotificationIds || new Set<string>();
  const visSet = ctx.visualizacoesIds || new Set<string>();
  const userFronts = ctx.userFrontIds || new Set<string>();

  if (!userId) return [];

  // --- 1. Novo Ponto de Bagunça Aberto (G1) ---
  ctx.pontosBagunca?.forEach((p) => {
    if (p.status === 'aberta' && p.relator_id !== userId) {
      const isLido = visSet.has(p.id) || readSet.has(`ponto-novo-${p.id}`);
      notifications.push({
        id: `ponto-novo-${p.id}`,
        category: 'ponto_bagunca',
        title: '🧹 Novo Ponto de Bagunça',
        message: `${p.local_descricao} — Abra para ver a foto (prazo de 24h)`,
        timestamp: p.created_at,
        read: isLido,
        urgency: 'normal',
        targetScreen: 'home',
      });
    }
  });

  // --- 2. Urgência: Ponto de Bagunça a <= 1h de Expirar (G2) ---
  ctx.pontosBagunca?.forEach((p) => {
    if (p.status === 'aberta' && !visSet.has(p.id)) {
      const exp = shouldNotifyPontoExpiring1h(p.created_at, agora);
      if (exp.shouldNotify) {
        const id = `ponto-expiring-1h-${p.id}`;
        notifications.push({
          id,
          category: 'ponto_bagunca',
          title: '⚠️ Urgente: Ponto de bagunça expira em menos de 1h!',
          message: `Ponto de bagunça (${p.local_descricao}) expira em menos de 1h! Veja a foto agora para não tomar 1 ponto.`,
          timestamp: agora.toISOString(),
          read: readSet.has(id),
          urgency: 'urgent',
          targetScreen: 'home',
        });
      }
    }
  });

  // --- 3. Ponto Individual Creditado (G3) ---
  ctx.pontosIndividuaisCreditados?.forEach((p) => {
    const id = `ponto-creditado-${p.id}`;
    const totalInfo = p.totalPontosMes !== undefined ? ` Total no mês: ${p.totalPontosMes}/7 pontos.` : '';
    notifications.push({
      id,
      category: 'ponto_bagunca',
      title: '📌 Ponto Individual Creditado',
      message: `Ponto de bagunça assumido/creditado (${p.local_descricao}).${totalInfo}`,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'normal',
      targetScreen: 'home',
    });
  });

  // --- 4. Ponto de Falta Lançado no Quadro de Faxina (G4) ---
  ctx.pontosFaltaRecebidos?.forEach((f) => {
    const id = `quadro-falta-${f.id}`;
    notifications.push({
      id,
      category: 'quadro_faxina',
      title: '🚨 Ponto no Quadro!',
      message: `Seu quarto recebeu +1 falta (${f.motivo}). Total na semana: ${f.totalFaltasSemana} ponto(s).`,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'urgent',
      targetScreen: 'quadro',
    });
  });

  // --- 5. Urgência: Foto da Faxina a <= 1h do Corte das 01:00 BRT (G5) ---
  if (ctx.escalasQuarto?.isEscaladoHoje && !ctx.escalasQuarto?.jaEnviouFotoHoje) {
    const check01h = shouldNotifyFaxina01h(agora, {
      isEscaladoHoje: true,
      jaEnviouFotoHoje: false,
    });
    if (check01h.shouldNotify) {
      const id = `faxina-corte-01h-${dateStr}`;
      notifications.push({
        id,
        category: 'quadro_faxina',
        title: '⚠️ Falta menos de 1h para a 01:00h!',
        message: `Envie a foto da faxina (${ctx.escalasQuarto.area_nome || 'área comum'}) antes da 01:00h para não tomar ponto.`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'urgent',
        targetScreen: 'quadro',
      });
    }
  }

  // --- 6. Nova Foto Enviada para o Fiscal Avaliar (G6) ---
  const isQuartoFiscal = Boolean(
    ctx.quartoFiscalId && ctx.currentUser?.quarto_id && ctx.quartoFiscalId === ctx.currentUser.quarto_id
  );
  if (isQuartoFiscal) {
    ctx.novasFotosFiscalHoje?.forEach((nf) => {
      const id = `fiscal-foto-nova-${nf.id}`;
      notifications.push({
        id,
        category: 'quadro_faxina',
        title: '📸 Fiscal (Halls): Nova Foto Enviada',
        message: `O quarto ${nf.quarto_nome} enviou a foto de ${nf.area_nome} para sua avaliação!`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'normal',
        targetScreen: 'quadro',
      });
    });
  }

  // --- 7. Urgência: Fiscalização do Halls a <= 1h do Corte das 11:00 BRT (G7) ---
  if (isQuartoFiscal) {
    const temPendentesOntem = Boolean(
      ctx.tarefasFiscalPendenteOntem && ctx.tarefasFiscalPendenteOntem.length > 0
    );
    const check11h = shouldNotifyHalls11h(agora, {
      isFiscal: true,
      temFotosPendentesOntem: temPendentesOntem,
    });
    if (check11h.shouldNotify) {
      const id = `halls-corte-11h-${dateStr}`;
      notifications.push({
        id,
        category: 'quadro_faxina',
        title: '⚠️ Fiscalização do Halls: Falta menos de 1h!',
        message: 'Avalie as fotos pendentes no painel do Halls antes das 11:00h para não tomar falta por omissão.',
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'urgent',
        targetScreen: 'quadro',
      });
    }
  }

  // --- 8. Nova Mensagem nos Chats das Frentes (G8) ---
  ctx.mensagensFrente?.forEach((m) => {
    if (userFronts.has(m.frente_id) && m.autor_id !== userId) {
      const id = `chat-frente-${m.id}`;
      const nomeFrente = m.frente_nome || ctx.frontsMap?.[m.frente_id]?.nome || 'Frente';
      notifications.push({
        id,
        category: 'chat_frente',
        title: `💬 ${nomeFrente}`,
        message: `${m.autor_apelido || 'Morador'}: ${m.conteudo}`,
        timestamp: m.enviada_em,
        read: readSet.has(id),
        urgency: 'normal',
        targetScreen: 'frentes',
      });
    }
  });

  // --- 9. Nova Mensagem no Chat de Ponto de Bagunça Aberto (G9) ---
  ctx.pontosMensagens?.forEach((m) => {
    if (m.autor_id !== userId) {
      const id = `chat-ponto-${m.id}`;
      notifications.push({
        id,
        category: 'ponto_bagunca',
        title: `🗣️ Discussão (${m.ponto_local_descricao || 'Ponto'})`,
        message: `${m.autor_apelido || 'Morador'}: ${m.conteudo}`,
        timestamp: m.enviada_em,
        read: readSet.has(id),
        urgency: 'normal',
        targetScreen: 'home',
      });
    }
  });

  // --- 10. Alocação em Frente ou Promoção a Líder (G10) ---
  ctx.alocacoesFrente?.forEach((aloc) => {
    const id = `frente-aloc-${aloc.front_id}-${aloc.is_lider ? 'lider' : 'membro'}`;
    notifications.push({
      id,
      category: 'chat_frente',
      title: '⭐ Frentes Organizacionais',
      message: aloc.is_lider
        ? `Você foi nomeado Líder da frente ${aloc.frente_nome}!`
        : `Você foi adicionado à frente ${aloc.frente_nome}!`,
      timestamp: aloc.data_inicio || agora.toISOString(),
      read: readSet.has(id),
      urgency: 'normal',
      targetScreen: 'frentes',
    });
  });

  // --- 11. Funça Atribuída a Você (G11) ---
  ctx.minhasFuncasAtribuidas?.forEach((f) => {
    const id = `funca-atribuida-${f.id}`;
    notifications.push({
      id,
      category: 'funca',
      title: '🛠️ Funça Atribuída',
      message: `Você é responsável pela funça: '${f.titulo}'`,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'normal',
      targetScreen: 'funcas',
    });
  });

  // --- 12. Nova Funça Aberta na Sua Frente (G12) ---
  ctx.novasFuncasNaMinhaFrente?.forEach((f) => {
    if (userFronts.has(f.frente_id) && f.relator_id !== userId) {
      const id = `funca-nova-frente-${f.id}`;
      notifications.push({
        id,
        category: 'funca',
        title: `🛠️ Nova funça em ${f.frente_nome}`,
        message: f.titulo,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'normal',
        targetScreen: 'funcas',
      });
    }
  });

  // --- 13. Lembrete de Prazo de Funça: Vence Hoje ou Atrasada (G13) ---
  ctx.minhasFuncasAtribuidas?.forEach((f) => {
    const statusPrazo = checkPrazoFunca(f.prazo, dateStr);
    if (statusPrazo === 'hoje') {
      const id = `funca-prazo-hoje-${f.id}-${dateStr}`;
      notifications.push({
        id,
        category: 'funca',
        title: '⏰ Prazo de Funça: Vence Hoje!',
        message: `A funça '${f.titulo}' vence hoje. Conclua para manter a ordem da casa!`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'urgent',
        targetScreen: 'funcas',
      });
    } else if (statusPrazo === 'atrasada') {
      const id = `funca-prazo-atrasada-${f.id}-${dateStr}`;
      notifications.push({
        id,
        category: 'funca',
        title: '⏰ Prazo de Funça: Atrasada!',
        message: `A funça '${f.titulo}' está atrasada (venceu em ${f.prazo}).`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'urgent',
        targetScreen: 'funcas',
      });
    }
  });

  // --- 14. Pedido de Troca de Funça Recebido (G14) ---
  ctx.pedidosTrocaRecebidos?.forEach((p) => {
    const id = `funca-troca-recebida-${p.funca_id}`;
    notifications.push({
      id,
      category: 'funca',
      title: '🔄 Pedido de Troca de Funça',
      message: `${p.solicitante_apelido} solicitou que você assuma a funça '${p.titulo}'.`,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'urgent',
      targetScreen: 'funcas',
    });
  });

  // --- 15. Resposta ao Seu Pedido de Troca de Funça (G15) ---
  ctx.respostasTroca?.forEach((r) => {
    const id = `funca-troca-resp-${r.funca_id}-${r.aceito ? 'aceito' : 'recusado'}`;
    notifications.push({
      id,
      category: 'funca',
      title: r.aceito ? '✅ Troca de Funça Aceita' : '❌ Troca de Funça Recusada',
      message: r.aceito
        ? `Seu pedido de troca da funça '${r.titulo}' foi aceito!`
        : `Seu pedido de troca da funça '${r.titulo}' foi recusado.`,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'normal',
      targetScreen: 'funcas',
    });
  });

  // --- 16. Frente Mercado: Solicitação de Item (G16) ---
  const isMercadoMember = Array.from(userFronts).some(
    (fId) => ctx.frontsMap?.[fId]?.slug === 'mercado'
  );
  if (isMercadoMember) {
    ctx.solicitacoesMercado?.forEach((sm) => {
      if (sm.solicitado_por !== userId) {
        const id = `mercado-solic-${sm.id}`;
        notifications.push({
          id,
          category: 'mercado',
          title: '🛒 Frente Mercado',
          message: `${sm.solicitante_apelido} solicitou reposição de ${sm.item_nome}`,
          timestamp: agora.toISOString(),
          read: readSet.has(id),
          urgency: 'normal',
          targetScreen: 'frentes',
        });
      }
    });
  }

  // --- 17. Frente Dogs: Alerta de Refeição Pendente 11h / 21h BRT (G17) ---
  const isDogsMember = Array.from(userFronts).some(
    (fId) => ctx.frontsMap?.[fId]?.slug === 'dogs'
  );
  if (isDogsMember) {
    const dogsCheck = shouldNotifyDogs11hOr21h(agora, {
      isMemberOrAdmin: true,
      refeicaoManhaFeita: Boolean(ctx.dogsRefeicaoManhaHojeFeita),
      refeicaoNoiteFeita: Boolean(ctx.dogsRefeicaoNoiteHojeFeita),
    });
    if (dogsCheck.shouldNotify && dogsCheck.window) {
      const id = `dogs-${dogsCheck.window}-${dateStr}`;
      notifications.push({
        id,
        category: 'dogs',
        title: `🐶 Frente Dogs (${dogsCheck.window === 'manha' ? '11h' : '21h'})`,
        message: dogsCheck.message,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'urgent',
        targetScreen: 'frentes',
      });
    }
  }

  // --- 18. Lembrete Diário da Folha de Misturas: 15h e 21h BRT (G18) ---
  const misturasCheck = shouldNotifyMisturas15hOr21h(agora, {
    misturasConsumidasHoje: ctx.minhasMisturasHoje ?? null,
  });
  if (misturasCheck.shouldNotify && misturasCheck.window) {
    const id = `misturas-${misturasCheck.window}-${dateStr}`;
    notifications.push({
      id,
      category: 'misturas',
      title: `🍽️ Folha de Misturas (${misturasCheck.window === 'almoco' ? '15h' : '21h'})`,
      message: misturasCheck.message,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'urgent',
      targetScreen: 'misturas',
    });
  }

  // --- 19. Caixas de Cerveja & Respostas de Baixa (G19) ---
  ctx.minhasCaixasAtribuidas?.forEach((cx) => {
    if (cx.status === 'pendente') {
      const id = `cerveja-nova-${cx.id}`;
      notifications.push({
        id,
        category: 'cerveja',
        title: '🍺 Caixa de Cerveja Atribuída',
        message: `Nova caixa de cerveja pendente: ${cx.motivo_descricao}`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'normal',
        targetScreen: 'cervejas',
      });
    }
  });

  ctx.respostasBaixaCerveja?.forEach((r) => {
    const id = `cerveja-baixa-resp-${r.id}-${r.aprovada ? 'aprovada' : 'recusada'}`;
    notifications.push({
      id,
      category: 'cerveja',
      title: r.aprovada ? '🍺 Baixa Confirmada!' : '⚠️ Baixa Recusada',
      message: r.aprovada
        ? `Boa! O Admin confirmou a baixa da sua caixa (${r.motivo_descricao}).`
        : `O Admin recusou a solicitação de baixa da sua caixa (${r.motivo_descricao}) — ela voltou para pendente.`,
      timestamp: agora.toISOString(),
      read: readSet.has(id),
      urgency: 'normal',
      targetScreen: 'cervejas',
    });
  });

  // --- 20. Alertas Exclusivos do Admin (G20) ---
  if (isAdmin) {
    if (ctx.perfisAguardandoAprovacaoCount && ctx.perfisAguardandoAprovacaoCount > 0) {
      const id = `admin-aprovacoes-${ctx.perfisAguardandoAprovacaoCount}`;
      notifications.push({
        id,
        category: 'admin',
        title: '👤 Moradores Aguardando Aprovação',
        message: `${ctx.perfisAguardandoAprovacaoCount} cadastro(s) aguardando sua liberação de acesso.`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'urgent',
        targetScreen: 'aprovacoes',
      });
    }

    if (ctx.solicitacoesBaixaCervejaAdminCount && ctx.solicitacoesBaixaCervejaAdminCount > 0) {
      const id = `admin-baixas-cerveja-${ctx.solicitacoesBaixaCervejaAdminCount}`;
      notifications.push({
        id,
        category: 'admin',
        title: '🍺 Baixas de Cerveja Pendentes',
        message: `${ctx.solicitacoesBaixaCervejaAdminCount} solicitação(ões) de baixa de cerveja aguardando conferência.`,
        timestamp: agora.toISOString(),
        read: readSet.has(id),
        urgency: 'normal',
        targetScreen: 'cervejas',
      });
    }
  }

  // Ordenação: Urgentes primeiro, depois mais recentes
  return notifications.sort((a, b) => {
    if (a.urgency === 'urgent' && b.urgency !== 'urgent') return -1;
    if (b.urgency === 'urgent' && a.urgency !== 'urgent') return 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

