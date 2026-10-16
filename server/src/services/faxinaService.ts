import { db } from '../db.ts';
import {
  FUNCOES_OFICIAIS,
  getIsoWeekAndYear,
  calcularProximaRotacao,
  REGRAS_PONTOS_PADRAO,
} from '../../../src/types/faxina.ts';
import type {
  QuadroSemanalConsolidado,
  TarefaDiariaItem,
  EscalaSemanalItem,
  RegraPontoItem,
} from '../../../src/types/faxina.ts';

function getLocalDateString(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function getOntemLocalDateString(hojeStr: string): string {
  const [y, m, d] = hojeStr.split('-').map(Number);
  const data = new Date(Date.UTC(y, m - 1, d));
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

export class FaxinaService {
  /**
   * Retorna o quadro consolidado da semana corrente (ou dispara rotação automática caso já exista escala anterior).
   */
  static async obterQuadroConsolidado(): Promise<QuadroSemanalConsolidado> {
    const agora = new Date();
    const { semana_ano, ano } = getIsoWeekAndYear(agora);
    const hojeStr = getLocalDateString(agora);

    // 1. Busca itens da escala da semana atual
    const { data: itensEscala, error: errEscala } = await db()
      .from('escala_semanal_faxina')
      .select(`
        quarto_id,
        area_comum_id,
        semana_ano,
        ano,
        pontos_faltas,
        penalidade_atribuida,
        quarto:rooms (id, nome, capacidade),
        area_comum:areas_comuns (id, nome, descricao)
      `)
      .eq('semana_ano', semana_ano)
      .eq('ano', ano);

    if (errEscala) {
      console.error('[FaxinaService] Erro ao buscar escala semanal:', errEscala);
    }

    // Se já existem itens para esta semana
    if (itensEscala && itensEscala.length >= 6) {
      const tarefasHoje = await this.garantirTarefasDoDia(hojeStr, semana_ano, ano, itensEscala as any);
      return await this.montarQuadro(semana_ano, ano, itensEscala as any, tarefasHoje);
    }

    // 2. Não existe escala para esta semana: tenta rotacionar a partir da última semana cadastrada
    const { data: ultimaEscala } = await db()
      .from('escala_semanal_faxina')
      .select(`
        quarto_id,
        area_comum_id,
        semana_ano,
        ano,
        area_comum:areas_comuns (id, nome)
      `)
      .order('ano', { ascending: false })
      .order('semana_ano', { ascending: false })
      .limit(6);

    if (ultimaEscala && ultimaEscala.length >= 6) {
      // Rotaciona automaticamente a partir da última semana!
      console.log(`[FaxinaService] Rotacionando automaticamente para a semana ${semana_ano}/${ano}...`);
      await this.avancarRodizioAutomatico(ultimaEscala as any, semana_ano, ano);

      // Re-busca a escala recém criada
      const { data: novaEscala } = await db()
        .from('escala_semanal_faxina')
        .select(`
          quarto_id,
          area_comum_id,
          semana_ano,
          ano,
          pontos_faltas,
          penalidade_atribuida,
          quarto:rooms (id, nome, capacidade),
          area_comum:areas_comuns (id, nome, descricao)
        `)
        .eq('semana_ano', semana_ano)
        .eq('ano', ano);

      const tarefasHoje = await this.garantirTarefasDoDia(hojeStr, semana_ano, ano, (novaEscala || []) as any);
      return await this.montarQuadro(semana_ano, ano, (novaEscala || []) as any, tarefasHoje);
    }

    // 3. Primeira vez no app: banco ainda não possui nenhuma escala cadastrada
    const { data: regrasDb } = await db()
      .from('regras_quadro_pontos')
      .select('pontos, descricao')
      .order('pontos');

    return {
      semana_ano,
      ano,
      penalidade_semana: 'Pagar 1 caixa de cerveja para a casa',
      regras_pontos: (regrasDb && regrasDb.length > 0) ? regrasDb : REGRAS_PONTOS_PADRAO,
      quarto_fiscal_id: null,
      quarto_fiscal_nome: null,
      itens: [],
      tarefas_hoje: [],
      precisa_inicializacao: true,
    };
  }

  /**
   * Salva/Atualiza as regras de penalidades para 2 a 7 pontos
   */
  static async salvarRegrasPontos(regras: RegraPontoItem[], usuarioId?: string): Promise<RegraPontoItem[]> {
    const rows = regras.map((r) => ({
      pontos: r.pontos,
      descricao: r.descricao.trim(),
      atualizado_por: usuarioId || null,
      atualizado_em: new Date().toISOString(),
    }));

    const { error } = await db()
      .from('regras_quadro_pontos')
      .upsert(rows, { onConflict: 'pontos' });

    if (error) {
      console.warn('[FaxinaService] Aviso ao salvar em regras_quadro_pontos:', error);
    }

    const { data: regrasSalvas } = await db()
      .from('regras_quadro_pontos')
      .select('pontos, descricao')
      .order('pontos');

    return (regrasSalvas && regrasSalvas.length > 0) ? regrasSalvas : regras;
  }

  /**
   * Inicializa manualmente a primeira semana da casa (Admin)
   */
  static async inicializarEscala(
    atribuicoes: { quarto_id: string; area_comum_id: string }[],
    penalidade = 'Pagar 1 caixa de cerveja para a casa',
    regrasPontos?: RegraPontoItem[],
    usuarioId?: string
  ): Promise<void> {
    const { semana_ano, ano } = getIsoWeekAndYear();

    if (regrasPontos && regrasPontos.length > 0) {
      await this.salvarRegrasPontos(regrasPontos, usuarioId);
    }

    const rows = atribuicoes.map((a) => ({
      quarto_id: a.quarto_id,
      area_comum_id: a.area_comum_id,
      semana_ano,
      ano,
      pontos_faltas: 0,
      penalidade_atribuida: penalidade,
    }));

    const { error } = await db()
      .from('escala_semanal_faxina')
      .upsert(rows, { onConflict: 'quarto_id,area_comum_id,semana_ano,ano' });

    if (error) {
      console.error('[FaxinaService] Erro ao inicializar escala:', error);
      throw error;
    }
  }

  /**
   * Registra envio da foto pelo quarto responsável
   */
  static async enviarFotoFaxina(params: {
    quarto_id: string;
    area_comum_id: string;
    foto_url: string;
    morador_id: string;
  }): Promise<void> {
    const hojeStr = getLocalDateString();
    const { semana_ano, ano } = getIsoWeekAndYear();

    const { error } = await db()
      .from('registro_diario_faxina')
      .upsert(
        {
          quarto_id: params.quarto_id,
          area_comum_id: params.area_comum_id,
          semana_ano,
          ano,
          data: hojeStr,
          status: 'cumprido',
          fotos_comprovacao: [params.foto_url],
          enviado_em: new Date().toISOString(),
          registrado_por: params.morador_id,
          fiscal_status: 'pendente',
        },
        { onConflict: 'quarto_id,area_comum_id,semana_ano,ano,data' }
      );

    if (error) {
      console.error('[FaxinaService] Erro ao enviar foto da faxina:', error);
      throw error;
    }
  }

  /**
   * Avaliação do Fiscal do Halls (Aprovação ou Reprovação)
   */
  static async fiscalizarTarefa(params: {
    tarefa_id?: string;
    quarto_id: string;
    area_comum_id: string;
    data: string;
    fiscal_status: 'aprovado' | 'reprovado';
    fiscal_foto_url?: string | null;
    fiscal_observacao?: string | null;
    fiscal_morador_id: string;
  }): Promise<void> {
    const { semana_ano, ano } = getIsoWeekAndYear();

    // 1. Atualiza registro da tarefa
    const { error } = await db()
      .from('registro_diario_faxina')
      .update({
        fiscal_status: params.fiscal_status,
        fiscal_foto_url: params.fiscal_foto_url || null,
        fiscal_observacao: params.fiscal_observacao || null,
        fiscalizado_em: new Date().toISOString(),
        fiscalizado_por: params.fiscal_morador_id,
      })
      .eq('quarto_id', params.quarto_id)
      .eq('area_comum_id', params.area_comum_id)
      .eq('data', params.data);

    if (error) {
      console.error('[FaxinaService] Erro ao fiscalizar tarefa:', error);
      throw error;
    }

    // 2. Se for reprovado expressamente, o quarto avaliado toma falta imediata!
    if (params.fiscal_status === 'reprovado') {
      await this.incrementarFaltaQuarto(params.quarto_id, semana_ano, ano);
    }
  }

  /**
   * Rotina de corte diário das 01:00 BRT:
   * Penaliza quartos que não enviaram fotos ontem e, se for domingo, avança o rodízio.
   */
  static async processarCorteDiario01h(dataReferencia?: string): Promise<{
    dataAuditada: string;
    quartosSemFotoPenalizados: string[];
    semanaVirada: boolean;
  }> {
    const hojeStr = dataReferencia || getLocalDateString();
    const dataOntem = getOntemLocalDateString(hojeStr);
    const { semana_ano, ano } = getIsoWeekAndYear(new Date(hojeStr + 'T12:00:00Z'));

    console.log(`[FaxinaService] Processando corte das 01:00 para o dia ${dataOntem}...`);

    // Busca registros de ontem
    const { data: tarefasOntem, error } = await db()
      .from('registro_diario_faxina')
      .select('*')
      .eq('data', dataOntem);

    if (error) {
      console.error('[FaxinaService] Erro ao buscar tarefas no corte das 01:00:', error);
    }

    const quartosPenalizados: string[] = [];

    if (tarefasOntem && tarefasOntem.length > 0) {
      for (const t of tarefasOntem) {
        // Se não enviou foto ou status != 'cumprido'
        const semFoto = !t.fotos_comprovacao || t.fotos_comprovacao.length === 0;
        if (semFoto || t.status !== 'cumprido') {
          // Marca status = 'faltou'
          await db()
            .from('registro_diario_faxina')
            .update({ status: 'faltou' })
            .eq('id', t.id);

          await this.incrementarFaltaQuarto(t.quarto_id, t.semana_ano, t.ano);
          quartosPenalizados.push(t.quarto_id);
        }
      }
    }

    // Se hoje for Domingo, vira a semana
    const dataObj = new Date(hojeStr + 'T12:00:00Z');
    const isDomingo = dataObj.getUTCDay() === 0;
    let semanaVirada = false;

    if (isDomingo) {
      console.log('[FaxinaService] Domingo detectado! Avançando rodízio semanal...');
      const quadro = await this.obterQuadroConsolidado();
      if (quadro.itens.length >= 6) {
        const { semana_ano: proxSemana, ano: proxAno } = getIsoWeekAndYear(
          new Date(dataObj.getTime() + 24 * 60 * 60 * 1000)
        );
        await this.avancarRodizioAutomatico(quadro.itens as any, proxSemana, proxAno);
        semanaVirada = true;
      }
    }

    return {
      dataAuditada: dataOntem,
      quartosSemFotoPenalizados: quartosPenalizados,
      semanaVirada,
    };
  }

  /**
   * Rotina de auditoria das 11:00 BRT:
   * Verifica se o Fiscal (Halls) deixou alguma tarefa de ontem sem check.
   */
  static async processarAuditoriaFiscal11h(dataReferencia?: string): Promise<{
    dataAuditada: string;
    hallsPenalizado: boolean;
    omissoes: number;
  }> {
    const hojeStr = dataReferencia || getLocalDateString();
    const dataOntem = getOntemLocalDateString(hojeStr);

    console.log(`[FaxinaService] Auditando fiscalização das 11:00 para o dia ${dataOntem}...`);

    // Descobre qual quarto era o Halls ontem (busca insensível a maiúsculas/minúsculas)
    const { data: areas } = await db().from('areas_comuns').select('id, nome');
    const areaHalls = areas?.find((a) => (a.nome || '').trim().toLowerCase() === 'halls');

    if (!areaHalls) {
      return { dataAuditada: dataOntem, hallsPenalizado: false, omissoes: 0 };
    }

    const { data: tarefasOntem } = await db()
      .from('registro_diario_faxina')
      .select('*')
      .eq('data', dataOntem);

    if (!tarefasOntem || tarefasOntem.length === 0) {
      return { dataAuditada: dataOntem, hallsPenalizado: false, omissoes: 0 };
    }

    const tarefaHalls = tarefasOntem.find((t) => t.area_comum_id === areaHalls.id);
    const quartoFiscalId = tarefaHalls?.quarto_id;

    if (!quartoFiscalId) {
      return { dataAuditada: dataOntem, hallsPenalizado: false, omissoes: 0 };
    }

    let omissoes = 0;
    for (const t of tarefasOntem) {
      // Outras funções que foram concluídas mas o fiscal não avaliou
      if (t.area_comum_id !== areaHalls.id && t.status === 'cumprido' && t.fiscal_status === 'pendente') {
        omissoes += 1;
        await db()
          .from('registro_diario_faxina')
          .update({ fiscal_status: 'omitido' })
          .eq('id', t.id);
      }
    }

    // Regra da Canta Grillo:
    // 1. O halls só toma no máximo 1 ponto por omissão no dia (independente de quantas tarefas omitiu).
    // 2. Se o halls já tiver ponto porque não tirou foto do hall (status = 'faltou'), NÃO toma outro ponto.
    const hallsJaTomouFaltaPorFoto = tarefaHalls?.status === 'faltou';
    const devePenalizarHalls = omissoes > 0 && !hallsJaTomouFaltaPorFoto;

    if (devePenalizarHalls) {
      const primeiro = tarefasOntem[0];
      await this.incrementarFaltaQuarto(quartoFiscalId, primeiro.semana_ano, primeiro.ano);
    }

    return {
      dataAuditada: dataOntem,
      hallsPenalizado: devePenalizarHalls,
      omissoes,
    };
  }

  // ============================================================================
  // MÉTODOS AUXILIARES
  // ============================================================================

  private static async incrementarFaltaQuarto(quartoId: string, semanaAno: number, ano: number): Promise<void> {
    const { data: escala } = await db()
      .from('escala_semanal_faxina')
      .select('pontos_faltas')
      .eq('quarto_id', quartoId)
      .eq('semana_ano', semanaAno)
      .eq('ano', ano)
      .maybeSingle();

    const faltasAtuais = escala?.pontos_faltas || 0;
    await db()
      .from('escala_semanal_faxina')
      .update({ pontos_faltas: faltasAtuais + 1 })
      .eq('quarto_id', quartoId)
      .eq('semana_ano', semanaAno)
      .eq('ano', ano);
  }

  private static async avancarRodizioAutomatico(
    escalaAnterior: { quarto_id: string; area_comum_id: string; area_comum?: { nome: string } }[],
    novaSemana: number,
    novoAno: number
  ): Promise<void> {
    const { data: areasDb } = await db().from('areas_comuns').select('id, nome');
    if (!areasDb) return;

    const normalizar = (s: string) => (s || '').trim().toLowerCase();
    // Mapeia áreas por índice oficial com comparação insensível a maiúsculas/minúsculas
    const areaPorIndice = FUNCOES_OFICIAIS.map((nome) => {
      const encontrada = areasDb.find((a) => normalizar(a.nome) === normalizar(nome));
      return encontrada || areasDb[0];
    });

    const funcoesAtuais = escalaAnterior.map((item) => {
      const nomeArea = item.area_comum?.nome || areasDb.find((a) => a.id === item.area_comum_id)?.nome;
      const indice = FUNCOES_OFICIAIS.findIndex((f) => normalizar(f) === normalizar(nomeArea || ''));
      return {
        quarto_id: item.quarto_id,
        area_ordem: indice >= 0 ? indice : 0,
      };
    });

    const proximaRotacao = calcularProximaRotacao(funcoesAtuais);

    const novosRegistros = proximaRotacao.map((r) => {
      const area = areaPorIndice[r.proxima_area_ordem] || areasDb[0];
      return {
        quarto_id: r.quarto_id,
        area_comum_id: area.id,
        semana_ano: novaSemana,
        ano: novoAno,
        pontos_faltas: 0,
        penalidade_atribuida: 'Pagar 1 caixa de cerveja para a casa',
      };
    });

    await db()
      .from('escala_semanal_faxina')
      .upsert(novosRegistros, { onConflict: 'quarto_id,area_comum_id,semana_ano,ano' });
  }

  private static async garantirTarefasDoDia(
    hojeStr: string,
    semanaAno: number,
    ano: number,
    itensEscala: EscalaSemanalItem[]
  ): Promise<TarefaDiariaItem[]> {
    // 1. Busca se já existem tarefas hoje
    const { data: tarefasExistentes } = await db()
      .from('registro_diario_faxina')
      .select(`
        *,
        quarto:rooms (id, nome, capacidade),
        area_comum:areas_comuns (id, nome, descricao),
        registrado_por_profile:profiles!registro_diario_faxina_registrado_por_fkey (id, nome, apelido),
        fiscalizado_por_profile:profiles!registro_diario_faxina_fiscalizado_por_fkey (id, nome, apelido)
      `)
      .eq('data', hojeStr);

    if (tarefasExistentes && tarefasExistentes.length >= 6) {
      return tarefasExistentes.map((t) => this.formatarTarefaItem(t));
    }

    // Cria as linhas do dia com status 'pendente'
    const tarefasParaInserir = itensEscala.map((item) => ({
      quarto_id: item.quarto_id,
      area_comum_id: item.area_comum_id,
      semana_ano: semanaAno,
      ano: ano,
      data: hojeStr,
      status: 'pendente',
      fotos_comprovacao: [],
      fiscal_status: 'pendente',
    }));

    await db()
      .from('registro_diario_faxina')
      .upsert(tarefasParaInserir, { onConflict: 'quarto_id,area_comum_id,semana_ano,ano,data' });

    // Re-busca completas
    const { data: reBusca } = await db()
      .from('registro_diario_faxina')
      .select(`
        *,
        quarto:rooms (id, nome, capacidade),
        area_comum:areas_comuns (id, nome, descricao),
        registrado_por_profile:profiles!registro_diario_faxina_registrado_por_fkey (id, nome, apelido),
        fiscalizado_por_profile:profiles!registro_diario_faxina_fiscalizado_por_fkey (id, nome, apelido)
      `)
      .eq('data', hojeStr);

    return (reBusca || []).map((t) => this.formatarTarefaItem(t));
  }

  private static formatarTarefaItem(t: any): TarefaDiariaItem {
    const isFiscal = t.area_comum?.nome === 'Halls';
    return {
      id: t.id,
      data: t.data,
      quarto_id: t.quarto_id,
      area_comum_id: t.area_comum_id,
      status: t.status,
      fotos_comprovacao: t.fotos_comprovacao || [],
      enviado_em: t.enviado_em,
      enviado_por: t.registrado_por,
      enviado_por_apelido: t.registrado_por_profile?.apelido || t.registrado_por_profile?.nome || null,
      fiscal_status: t.fiscal_status,
      fiscal_foto_url: t.fiscal_foto_url,
      fiscal_observacao: t.fiscal_observacao,
      fiscalizado_em: t.fiscalizado_em,
      fiscalizado_por: t.fiscalizado_por,
      fiscalizado_por_apelido: t.fiscalizado_por_profile?.apelido || t.fiscalizado_por_profile?.nome || null,
      quarto: t.quarto,
      area_comum: t.area_comum,
      isFiscal,
    };
  }

  private static async montarQuadro(
    semanaAno: number,
    ano: number,
    itens: EscalaSemanalItem[],
    tarefasHoje: TarefaDiariaItem[]
  ): Promise<QuadroSemanalConsolidado> {
    const itemFiscal = itens.find((i) => (i.area_comum?.nome || '').trim().toLowerCase() === 'halls');
    const penalidade = itens[0]?.penalidade_atribuida || 'Pagar 1 caixa de cerveja para a casa';

    const { data: regrasDb } = await db()
      .from('regras_quadro_pontos')
      .select('pontos, descricao')
      .order('pontos');

    return {
      semana_ano: semanaAno,
      ano: ano,
      penalidade_semana: penalidade,
      regras_pontos: (regrasDb && regrasDb.length > 0) ? regrasDb : REGRAS_PONTOS_PADRAO,
      quarto_fiscal_id: itemFiscal?.quarto_id || null,
      quarto_fiscal_nome: itemFiscal?.quarto?.nome || null,
      itens,
      tarefas_hoje: tarefasHoje,
      precisa_inicializacao: false,
    };
  }
}
