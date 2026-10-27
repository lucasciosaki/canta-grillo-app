import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { PageTitle, Button, Tag } from '../../components/ui';
import type {
  QuadroSemanalConsolidado,
  TarefaDiariaItem,
  Quarto,
  AreaComum,
  RegraPontoItem,
  DiaSemanaQuadro,
} from '../../types/faxina';
import {
  getIsoWeekAndYear,
  getDiasDaSemanaIso,
  REGRAS_PONTOS_PADRAO,
  obterRegraPorPontos,
} from '../../types/faxina';
import {
  ShieldCheck,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Tv,
  BookOpen,
  Trees,
  Package,
  UtensilsCrossed,
  DoorOpen,
  AlertTriangle,
  RotateCcw,
  Settings,
  X,
  Wand2,
  ChevronDown,
  ChevronUp,
  Scale,
} from 'lucide-react';

interface QuadroPontosScreenProps {
  onBack: () => void;
}

/** 6 Funções Canônicas da República Canta Grillo */
const FUNCOES_CANONICAS = [
  { nome: 'Sala de TV', descricao: 'Organização diária e recolhimento de itens na Sala de TV' },
  { nome: 'Sala de Estudos', descricao: 'Limpeza de mesas, cadeiras e organização do espaço de estudos' },
  { nome: 'Externo', descricao: 'Limpeza e recolhimento de materiais na área externa' },
  { nome: 'Dispensa', descricao: 'Organização das prateleiras e mantimentos na dispensa' },
  { nome: 'Cozinha', descricao: 'Organização de pias, bancadas e recolhimento de louças' },
  { nome: 'Halls', descricao: 'Limpeza dos corredores e fiscalização diária das outras 5 funções da casa' },
];

/** 6 Quartos Canônicos da República Canta Grillo */
const QUARTOS_CANONICOS = [
  'Carandiru',
  'High School',
  'Principal',
  'Quádruplo',
  'Triplo',
  'Varanda',
];

/** Retorna o ícone temático de cada função da Canta Grillo */
function getAreaIcon(nomeArea: string) {
  switch (nomeArea) {
    case 'Sala de TV':
      return <Tv className="w-5 h-5 text-forest" />;
    case 'Sala de Estudos':
      return <BookOpen className="w-5 h-5 text-forest" />;
    case 'Externo':
      return <Trees className="w-5 h-5 text-forest" />;
    case 'Dispensa':
      return <Package className="w-5 h-5 text-forest" />;
    case 'Cozinha':
      return <UtensilsCrossed className="w-5 h-5 text-forest" />;
    case 'Halls':
      return <DoorOpen className="w-5 h-5 text-forest" />;
    default:
      return <Sparkles className="w-5 h-5 text-forest" />;
  }
}

import { uploadImageToBucket } from '../../utils/imageStorage';

export const QuadroPontosScreen: React.FC<QuadroPontosScreenProps> = ({ onBack }) => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'quadro' | 'minha_funcao' | 'fiscal'>('quadro');
  const [loading, setLoading] = useState(true);
  const [quadro, setQuadro] = useState<QuadroSemanalConsolidado | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de Envio de Foto
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Fiscalização
  const [tarefaFiscalizando, setTarefaFiscalizando] = useState<TarefaDiariaItem | null>(null);
  const [fiscalDecisao, setFiscalDecisao] = useState<'aprovado' | 'reprovado' | null>(null);
  const [fiscalObservacao, setFiscalObservacao] = useState('');
  const [fiscalFotoPreview, setFiscalFotoPreview] = useState<string | null>(null);
  const [fiscalFotoFile, setFiscalFotoFile] = useState<File | null>(null);
  const [enviandoFiscal, setEnviandoFiscal] = useState(false);
  const fiscalFileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Imagem em Tela Cheia e Modal de Foto do Dia da Semana
  const [imagemExpandida, setImagemExpandida] = useState<string | null>(null);
  const [tarefaDiaSelecionada, setTarefaDiaSelecionada] = useState<{
    tarefa: TarefaDiariaItem;
    dia: DiaSemanaQuadro;
  } | null>(null);

  // Estados de Administração
  const [modalAdminOpen, setModalAdminOpen] = useState(false);
  const [modalAdminTab, setModalAdminTab] = useState<'escala' | 'regras'>('escala');
  const [loadingDadosIniciais, setLoadingDadosIniciais] = useState(false);
  const [dadosIniciais, setDadosIniciais] = useState<{ rooms: Quarto[]; areas: AreaComum[] } | null>(null);
  const [atribuicoesForm, setAtribuicoesForm] = useState<{ [areaId: string]: string }>({});
  const [penalidadeForm, setPenalidadeForm] = useState('Pagar 1 caixa de cerveja para a casa');
  const [salvandoEscala, setSalvandoEscala] = useState(false);
  const [adminAcaoMsg, setAdminAcaoMsg] = useState<string | null>(null);

  // Estados de Regras de Penalidades (2 a 7 Pontos)
  const [regrasPontos, setRegrasPontos] = useState<RegraPontoItem[]>(REGRAS_PONTOS_PADRAO);
  const [regrasForm, setRegrasForm] = useState<{ [pontos: number]: string }>(() => {
    const initial: { [p: number]: string } = {};
    REGRAS_PONTOS_PADRAO.forEach((r) => {
      initial[r.pontos] = r.descricao;
    });
    return initial;
  });
  const [regrasExpandidas, setRegrasExpandidas] = useState(false);
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const hasEnsuredQuadroRef = useRef(false);
  const faxinaDebounceRef = useRef<any>(null);

  // Carrega Quartos e Funções para configuração da escala
  const carregarDadosIniciais = useCallback(async () => {
    try {
      setLoadingDadosIniciais(true);

      // 1. Busca direto do Supabase
      const [roomsSupa, areasSupa] = await Promise.all([
        supabase.from('rooms').select('id, nome, capacidade').order('nome'),
        supabase.from('areas_comuns').select('id, nome, descricao'),
      ]);

      let rooms: Quarto[] = (roomsSupa.data as Quarto[]) || [];
      let areas: AreaComum[] = (areasSupa.data as AreaComum[]) || [];

      // 2. Se areas_comuns estiver vazia, tenta semear ou usa fallback canônico
      if (areas.length === 0) {
        try {
          const { data: insertedAreas } = await supabase
            .from('areas_comuns')
            .upsert(FUNCOES_CANONICAS, { onConflict: 'nome' })
            .select('id, nome, descricao');

          if (insertedAreas && insertedAreas.length > 0) {
            areas = insertedAreas as AreaComum[];
          }
        } catch {
          // Fallback se faltar permissão
        }

        if (areas.length === 0) {
          areas = FUNCOES_CANONICAS.map((f, idx) => ({
            id: `canonico-${idx}`,
            nome: f.nome,
            descricao: f.descricao,
          }));
        }
      }

      // 3. Se rooms estiver vazia, tenta semear ou usa canônicos
      if (rooms.length === 0) {
        try {
          const { data: insertedRooms } = await supabase
            .from('rooms')
            .upsert(QUARTOS_CANONICOS.map((n) => ({ nome: n, capacidade: 4 })), { onConflict: 'nome' })
            .select('id, nome, capacidade');

          if (insertedRooms && insertedRooms.length > 0) {
            rooms = insertedRooms as Quarto[];
          }
        } catch {
          // Fallback
        }

        if (rooms.length === 0) {
          rooms = QUARTOS_CANONICOS.map((n, idx) => ({
            id: `quarto-canonico-${idx}`,
            nome: n,
            capacidade: 4,
          }));
        }
      }

      setDadosIniciais({ rooms, areas });
    } catch (err) {
      console.error('[QuadroPontosScreen] Erro ao carregar dados iniciais:', err);
    } finally {
      setLoadingDadosIniciais(false);
    }
  }, []);

  // Carrega Quadro Consolidado Diretamente do Supabase + RPC
  const carregarQuadro = useCallback(async () => {
    try {
      setErrorMsg(null);

      const agora = new Date();
      const hojeStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(agora);
      const [anoStr, mesStr, diaStr] = hojeStr.split('-').map(Number);
      const { semana_ano, ano } = getIsoWeekAndYear(new Date(anoStr, mesStr - 1, diaStr, 12, 0, 0));

      // 1. Invoca a RPC nativa para garantir a escala da semana e tarefas do dia apenas na carga inicial
      if (!hasEnsuredQuadroRef.current) {
        hasEnsuredQuadroRef.current = true;
        try {
          await supabase.rpc('garantir_quadro_faxina_atual', {
            p_semana_ano: semana_ano,
            p_ano: ano,
            p_data: hojeStr,
          });
        } catch (rpcErr) {
          console.warn('[QuadroPontosScreen] Aviso ao chamar garantir_quadro_faxina_atual:', rpcErr);
        }
      }

      // 2. Consulta itens da escala da semana atual
      const { data: itensDb, error: errEscala } = await supabase
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
        console.error('[QuadroPontosScreen] Erro ao buscar escala semanal:', errEscala);
      }

      const itens = (itensDb as any[]) || [];
      const precisa_inicializacao = itens.length < 6;

      // 3. Consulta regras configuradas de 2 a 7 pontos
      let regrasCarregadas = REGRAS_PONTOS_PADRAO;
      try {
        const { data: regrasDb } = await supabase
          .from('regras_quadro_pontos')
          .select('pontos, descricao')
          .order('pontos');

        if (regrasDb && regrasDb.length > 0) {
          regrasCarregadas = regrasDb as RegraPontoItem[];
          setRegrasPontos(regrasCarregadas);
          const formMap: { [p: number]: string } = {};
          regrasCarregadas.forEach((r) => {
            formMap[r.pontos] = r.descricao;
          });
          setRegrasForm((prev) => ({ ...prev, ...formMap }));
        }
      } catch (errRegras) {
        console.warn('[QuadroPontosScreen] Usando regras padrão:', errRegras);
      }

      // 4. Consulta todas as tarefas da semana atual (sem foreign keys inexistentes para rooms/areas_comuns)
      const { data: tarefasDb, error: errTarefas } = await supabase
        .from('registro_diario_faxina')
        .select(`
          id,
          quarto_id,
          area_comum_id,
          semana_ano,
          ano,
          data,
          status,
          fotos_comprovacao,
          enviado_em,
          registrado_por,
          fiscal_status,
          fiscal_foto_url,
          fiscal_observacao,
          fiscalizado_em,
          fiscalizado_por,
          perfil_registrado:profiles!registrado_por (apelido, nome),
          perfil_fiscalizado:profiles!fiscalizado_por (apelido, nome)
        `)
        .eq('semana_ano', semana_ano)
        .eq('ano', ano)
        .order('data', { ascending: true });

      if (errTarefas) {
        console.error('[QuadroPontosScreen] Erro ao buscar tarefas da semana:', errTarefas);
      }

      // Fallback para nomes/apelidos de profiles via busca direta caso o join retorne nulo
      const userIdsParaBuscar = Array.from(
        new Set(
          (tarefasDb || [])
            .flatMap((t: any) => [t.registrado_por, t.fiscalizado_por])
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      let profilesMap = new Map<string, { apelido?: string | null; nome?: string | null }>();
      if (userIdsParaBuscar.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, apelido, nome')
            .in('id', userIdsParaBuscar);
          if (profs) {
            profs.forEach((p: any) => profilesMap.set(p.id, p));
          }
        } catch {
          // Fallback silencioso caso RLS de anon
        }
      }

      const itemFiscal = itens.find((i) => (i.area_comum?.nome || '').trim().toLowerCase() === 'halls');
      const penalidadeSemana = itens[0]?.penalidade_atribuida || 'Pagar 1 caixa de cerveja para a casa';

      const tarefasSemana: TarefaDiariaItem[] = (tarefasDb || []).map((t: any) => {
        const itemEscala = itens.find(
          (i) => i.quarto_id === t.quarto_id && i.area_comum_id === t.area_comum_id
        ) || itens.find((i) => i.quarto_id === t.quarto_id);

        const profReg = profilesMap.get(t.registrado_por);
        const profFisc = profilesMap.get(t.fiscalizado_por);

        return {
          ...t,
          enviado_por_apelido:
            t.perfil_registrado?.apelido ||
            t.perfil_registrado?.nome ||
            profReg?.apelido ||
            profReg?.nome ||
            null,
          fiscalizado_por_apelido:
            t.perfil_fiscalizado?.apelido ||
            t.perfil_fiscalizado?.nome ||
            profFisc?.apelido ||
            profFisc?.nome ||
            null,
          quarto: itemEscala?.quarto || t.quarto,
          area_comum: itemEscala?.area_comum || t.area_comum,
          isFiscal: (itemEscala?.area_comum?.nome || '').trim().toLowerCase() === 'halls',
        };
      });

      const quadroConsolidado: QuadroSemanalConsolidado = {
        semana_ano,
        ano,
        penalidade_semana: penalidadeSemana,
        regras_pontos: regrasCarregadas,
        quarto_fiscal_id: itemFiscal?.quarto_id || null,
        quarto_fiscal_nome: itemFiscal?.quarto?.nome || null,
        itens,
        tarefas_hoje: tarefasSemana.filter((t) => t.data === hojeStr),
        tarefas_semana: tarefasSemana,
        precisa_inicializacao,
      };

      setQuadro(quadroConsolidado);
      if (precisa_inicializacao && isAdmin) {
        carregarDadosIniciais();
      }
    } catch (err: any) {
      console.error('[QuadroPontosScreen] Erro ao buscar quadro:', err);
      setErrorMsg('Não foi possível carregar o quadro de pontos. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, carregarDadosIniciais]);

  useEffect(() => {
    carregarQuadro();

    const triggerDebounced = () => {
      if (faxinaDebounceRef.current) clearTimeout(faxinaDebounceRef.current);
      faxinaDebounceRef.current = setTimeout(() => {
        carregarQuadro();
      }, 800);
    };

    // Sincronização em tempo real via Supabase Realtime com debounce
    const channel = supabase
      .channel('realtime_faxina_quadro')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registro_diario_faxina' },
        triggerDebounced
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'escala_semanal_faxina' },
        triggerDebounced
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'regras_quadro_pontos' },
        triggerDebounced
      )
      .subscribe();

    return () => {
      if (faxinaDebounceRef.current) clearTimeout(faxinaDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [carregarQuadro]);

  // Identifica o quarto do morador logado
  const moradorQuartoId = profile?.quarto_id;
  const minhaEscala = quadro?.itens.find((i) => i.quarto_id === moradorQuartoId);
  const minhaTarefaHoje = quadro?.tarefas_hoje.find((t) => t.quarto_id === moradorQuartoId);
  const souFiscal = Boolean(
    (moradorQuartoId && quadro?.quarto_fiscal_id && moradorQuartoId === quadro.quarto_fiscal_id) ||
      isAdmin
  );

  // Redireciona da aba Fiscal caso o usuário não pertença ao quarto do Halls nem seja Admin
  useEffect(() => {
    if (activeTab === 'fiscal' && !souFiscal) {
      setActiveTab('quadro');
    }
  }, [activeTab, souFiscal]);

  // Contador de pendências para o fiscal
  const pendenciasFiscal = quadro?.tarefas_hoje.filter(
    (t) => t.quarto_id !== quadro?.quarto_fiscal_id && t.status === 'cumprido' && t.fiscal_status === 'pendente'
  ).length || 0;

  // Manipulação de Upload de Foto da Faxina (Upsert direto em registro_diario_faxina)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      if (!minhaEscala || !user) {
        throw new Error('Você não está escalado em nenhum quarto nesta semana.');
      }

      const photoUrl = await uploadImageToBucket({
        bucket: 'faxina',
        userId: user.id,
        prefix: 'faxina',
        file,
        maxDim: 800,
        quality: 0.72,
      });

      const hojeStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      const semana_ano = minhaEscala.semana_ano || quadro?.semana_ano || getIsoWeekAndYear().semana_ano;
      const ano = minhaEscala.ano || quadro?.ano || getIsoWeekAndYear().ano;

      // Upsert direto no Supabase: o trigger trg_validate_and_apply_faxina_rules valida que o morador
      // só envia para seu próprio quarto (ou admin), atribuindo registrado_por automaticamente.
      const { error: upsertErr } = await supabase
        .from('registro_diario_faxina')
        .upsert(
          {
            quarto_id: minhaEscala.quarto_id,
            area_comum_id: minhaEscala.area_comum_id,
            semana_ano,
            ano,
            data: hojeStr,
            status: 'cumprido',
            fotos_comprovacao: [photoUrl],
            enviado_em: new Date().toISOString(),
            registrado_por: user.id,
            fiscal_status: 'pendente',
          },
          { onConflict: 'quarto_id,area_comum_id,semana_ano,ano,data' }
        );

      if (upsertErr) {
        throw new Error(upsertErr.message || 'Erro ao registrar envio da foto.');
      }

      await carregarQuadro();
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar foto.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Envio da Fiscalização (Update direto em registro_diario_faxina)
  const handleSalvarFiscalizacao = async () => {
    if (!tarefaFiscalizando || !fiscalDecisao || !user) return;

    try {
      setEnviandoFiscal(true);

      let finalFiscalFotoUrl: string | null = null;
      if (fiscalFotoFile) {
        finalFiscalFotoUrl = await uploadImageToBucket({
          bucket: 'faxina',
          userId: user.id,
          prefix: 'contraprova',
          file: fiscalFotoFile,
          maxDim: 800,
          quality: 0.72,
        });
      } else if (fiscalFotoPreview && fiscalFotoPreview.startsWith('http')) {
        finalFiscalFotoUrl = fiscalFotoPreview;
      }

      // Update direto no Supabase: o trigger trg_validate_and_apply_faxina_rules valida se auth.uid()
      // pertence ao quarto do Halls (ou Admin) e trg_faxina_reprovado_falta incrementa a falta se reprovado.
      const { error: updateErr } = await supabase
        .from('registro_diario_faxina')
        .update({
          fiscal_status: fiscalDecisao,
          fiscal_foto_url: finalFiscalFotoUrl,
          fiscal_observacao: fiscalObservacao.trim() || null,
          fiscalizado_em: new Date().toISOString(),
          fiscalizado_por: user.id,
        })
        .eq('quarto_id', tarefaFiscalizando.quarto_id)
        .eq('area_comum_id', tarefaFiscalizando.area_comum_id)
        .eq('data', tarefaFiscalizando.data);

      if (updateErr) {
        throw new Error(updateErr.message || 'Erro ao registrar fiscalização.');
      }

      setTarefaFiscalizando(null);
      setFiscalDecisao(null);
      setFiscalObservacao('');
      setFiscalFotoPreview(null);
      setFiscalFotoFile(null);
      await carregarQuadro();
    } catch (err: any) {
      alert(err.message || 'Erro ao fiscalizar.');
    } finally {
      setEnviandoFiscal(false);
    }
  };

  // Preenchimento Rápido 1 para 1 das 6 Funções aos 6 Quartos
  const handleAtribuicaoRapida = () => {
    if (!dadosIniciais) return;
    const { rooms, areas } = dadosIniciais;
    if (rooms.length === 0 || areas.length === 0) return;

    const novasAtribuicoes: { [areaId: string]: string } = {};
    areas.forEach((area, index) => {
      const quarto = rooms[index % rooms.length];
      if (quarto) {
        novasAtribuicoes[area.id] = quarto.id;
      }
    });
    setAtribuicoesForm(novasAtribuicoes);
  };

  // Salvar Inicialização de Escala (Admin) - Diretamente no Supabase
  const handleSalvarInicializacao = async () => {
    if (!dadosIniciais) return;

    try {
      setSalvandoEscala(true);
      const atribuicoes = dadosIniciais.areas.map((a) => ({
        quarto_id: atribuicoesForm[a.id] || '',
        area_comum_id: a.id,
        area_nome: a.nome,
      }));

      // Validação: 6 quartos distintos
      const quartosUnicos = new Set(atribuicoes.map((a) => a.quarto_id).filter(Boolean));
      if (quartosUnicos.size !== 6) {
        alert('Por favor, selecione 1 quarto único para cada uma das 6 funções (total de 6 quartos distintos).');
        return;
      }

      const { semana_ano, ano } = getIsoWeekAndYear();
      const hojeStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      // 1. Garante mapeamento correto de IDs das áreas comuns
      const { data: areasDb } = await supabase.from('areas_comuns').select('id, nome');
      const mapAreaNomeParaId = new Map((areasDb || []).map((a) => [(a.nome || '').trim().toLowerCase(), a.id]));

      const rows = atribuicoes.map((a) => {
        const areaRealId = mapAreaNomeParaId.get((a.area_nome || '').trim().toLowerCase()) || a.area_comum_id;
        return {
          quarto_id: a.quarto_id,
          area_comum_id: areaRealId,
          semana_ano,
          ano,
          pontos_faltas: 0,
          penalidade_atribuida: penalidadeForm,
        };
      });

      const { error: insErr } = await supabase
        .from('escala_semanal_faxina')
        .upsert(rows, { onConflict: 'quarto_id,area_comum_id,semana_ano,ano' });

      if (insErr) {
        throw new Error(`Erro ao salvar escala no banco: ${insErr.message}`);
      }

      // 2. Salva regras configuradas de penalidades
      const regrasParaSalvar: RegraPontoItem[] = [2, 3, 4, 5, 6, 7].map((pts) => ({
        pontos: pts,
        descricao: (regrasForm[pts] || '').trim() || (REGRAS_PONTOS_PADRAO.find((r) => r.pontos === pts)?.descricao ?? ''),
      }));

      const regrasRows = regrasParaSalvar.map((r) => ({
        pontos: r.pontos,
        descricao: r.descricao,
        atualizado_por: user?.id,
        atualizado_em: new Date().toISOString(),
      }));

      await supabase.from('regras_quadro_pontos').upsert(regrasRows, { onConflict: 'pontos' });

      // 3. Garante geração das 6 tarefas do dia chamando a RPC
      try {
        await supabase.rpc('garantir_quadro_faxina_atual', {
          p_semana_ano: semana_ano,
          p_ano: ano,
          p_data: hojeStr,
        });
      } catch (rpcErr) {
        console.warn('[QuadroPontosScreen] Aviso ao chamar RPC após salvar escala:', rpcErr);
      }

      setModalAdminOpen(false);
      await carregarQuadro();
      alert('Escala semanal dos 6 quartos configurada com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar escala.');
    } finally {
      setSalvandoEscala(false);
    }
  };

  // Salvar Regras de Penalidades (2 a 7 Pontos) - Admin Diretamente no Supabase
  const handleSalvarRegras = async () => {
    try {
      setSalvandoRegras(true);
      const novasRegras: RegraPontoItem[] = [2, 3, 4, 5, 6, 7].map((pts) => ({
        pontos: pts,
        descricao: (regrasForm[pts] || '').trim() || (REGRAS_PONTOS_PADRAO.find((r) => r.pontos === pts)?.descricao ?? ''),
      }));

      const rows = novasRegras.map((r) => ({
        pontos: r.pontos,
        descricao: r.descricao,
        atualizado_por: user?.id,
        atualizado_em: new Date().toISOString(),
      }));

      const { error: insErr } = await supabase
        .from('regras_quadro_pontos')
        .upsert(rows, { onConflict: 'pontos' });

      if (insErr) {
        throw new Error(`Erro ao salvar regras no banco: ${insErr.message}`);
      }

      setRegrasPontos(novasRegras);
      await carregarQuadro();
      alert('Regras de penalidades de 2 a 7 pontos salvas com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar regras de pontos.');
    } finally {
      setSalvandoRegras(false);
    }
  };

  // Restaurar Regras Padrão (2 a 7 Pontos)
  const handleRestaurarRegrasPadrao = () => {
    const padrao: { [p: number]: string } = {};
    REGRAS_PONTOS_PADRAO.forEach((r) => {
      padrao[r.pontos] = r.descricao;
    });
    setRegrasForm(padrao);
  };

  // Disparos Administrativos de Teste via RPC Nativa do Supabase
  const handleSimularCorte01h = async () => {
    try {
      setAdminAcaoMsg('Executando corte diário das 01h via RPC no Supabase...');
      const { data, error } = await supabase.rpc('processar_corte_diario_01h');
      if (error) throw error;
      const d = data as any;
      setAdminAcaoMsg(
        `Corte executado! ${d?.quartosPenalizados?.length || 0} quarto(s) penalizado(s). Semana virada: ${d?.semanaVirada ? 'Sim' : 'Não'}.`
      );
      await carregarQuadro();
    } catch (err: any) {
      setAdminAcaoMsg(`Erro ao simular corte: ${err.message}`);
    }
  };

  const handleSimularAuditoria11h = async () => {
    try {
      setAdminAcaoMsg('Executando simulação de auditoria das 11h via RPC no Supabase...');
      const { data, error } = await supabase.rpc('processar_auditoria_fiscal_11h');
      if (error) throw error;
      const d = data as any;
      setAdminAcaoMsg(
        `Auditoria executada! Omissões detectadas: ${d?.omissoes || 0}. Halls penalizado: ${d?.hallsPenalizado ? 'Sim' : 'Não'}.`
      );
      await carregarQuadro();
    } catch (err: any) {
      setAdminAcaoMsg(`Erro ao simular auditoria: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-2 border-forest border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-muted">Carregando quadro de pontos...</p>
      </div>
    );
  }

  // Permite acesso ao Admin tanto para profile.role === 'admin' quanto quando a casa precisa de inicialização
  const podeAcessarAdmin = isAdmin || quadro?.precisa_inicializacao || !quadro?.itens || quadro.itens.length === 0;
  const hojeStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const diasDaSemana = quadro ? getDiasDaSemanaIso(quadro.semana_ano, quadro.ano) : [];

  return (
    <div className="pb-16 max-w-lg mx-auto">
      {/* Cabeçalho */}
      <PageTitle
        title="Quadro de Pontos"
        hint={`Semana ${quadro?.semana_ano || 0} · ${quadro?.ano || 2026}`}
        back={{ label: 'Voltar', onClick: onBack }}
        action={
          podeAcessarAdmin ? (
            <button
              onClick={() => {
                carregarDadosIniciais();
                setModalAdminOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-line bg-surface text-ink text-xs font-medium hover:border-forest transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Settings className="w-3.5 h-3.5 text-forest" />
              <span>Admin</span>
            </button>
          ) : undefined
        }
      />

      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-clay-tint border border-clay/30 text-clay text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Card de Regras Progressivas de Penalidades (2 a 7 Pontos) */}
      <div className="mb-4 rounded-2xl bg-surface border border-line p-3.5 shadow-2xs">
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setRegrasExpandidas((prev) => !prev)}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cream border border-line flex items-center justify-center text-forest shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink">Regras do Quadro de Pontos</span>
                <Tag tone="alert">2 a 7 Faltas</Tag>
              </div>
              <p className="text-[11px] text-muted">
                Penalidades progressivas acumuladas na semana
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {podeAcessarAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalAdminTab('regras');
                  setModalAdminOpen(true);
                }}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-forest bg-mint/50 border border-forest/20 hover:bg-mint transition-colors"
              >
                Editar Regras
              </button>
            )}
            <button
              type="button"
              className="p-1 rounded-lg text-muted hover:text-ink transition-colors"
              aria-label={regrasExpandidas ? 'Recolher regras' : 'Expandir regras'}
            >
              {regrasExpandidas ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Resumo compacto quando recolhido */}
        {!regrasExpandidas && (
          <div className="mt-2.5 pt-2.5 border-t border-line/60 flex items-center justify-between text-xs text-muted">
            <span className="truncate pr-2">
              <strong className="text-ink">2 faltas:</strong>{' '}
              {regrasPontos.find((r) => r.pontos === 2)?.descricao || '1 caixa de cerveja'}
            </span>
            <button
              type="button"
              onClick={() => setRegrasExpandidas(true)}
              className="text-[11px] text-forest font-semibold hover:underline shrink-0"
            >
              Ver todos os 7 níveis
            </button>
          </div>
        )}

        {/* Tabela de 2 a 7 pontos quando expandido */}
        {regrasExpandidas && (
          <div className="mt-3 pt-3 border-t border-line/60 space-y-2">
            {regrasPontos.map((regra) => (
              <div
                key={regra.pontos}
                className="flex items-center justify-between gap-3 p-2 rounded-xl bg-cream/40 border border-line text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-clay-tint text-clay border border-clay/30 flex items-center justify-center font-bold text-xs shrink-0">
                    {regra.pontos}
                  </span>
                  <span className="font-semibold text-ink">
                    {regra.pontos} {regra.pontos === 1 ? 'falta' : 'faltas'}
                  </span>
                </div>
                <span className="text-right text-xs font-semibold text-ink">
                  {regra.descricao}
                </span>
              </div>
            ))}
            {podeAcessarAdmin && (
              <div className="pt-2 text-right">
                <Button
                  variant="outline"
                  onClick={() => {
                    setModalAdminTab('regras');
                    setModalAdminOpen(true);
                  }}
                >
                  <Settings className="w-3.5 h-3.5 mr-1 inline" />
                  Configurar Regras de 2 a 7 Pontos
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navegação entre Abas */}
      <div className="flex rounded-xl bg-surface border border-line p-1 mb-5 text-xs font-medium shadow-2xs">
        <button
          onClick={() => setActiveTab('quadro')}
          className={`flex-1 py-2 rounded-lg transition-colors text-center ${
            activeTab === 'quadro' ? 'bg-forest text-white shadow-xs font-semibold' : 'text-muted hover:text-ink'
          }`}
        >
          Quadro Geral
        </button>

        <button
          onClick={() => setActiveTab('minha_funcao')}
          className={`flex-1 py-2 rounded-lg transition-colors text-center relative ${
            activeTab === 'minha_funcao'
              ? 'bg-forest text-white shadow-xs font-semibold'
              : 'text-muted hover:text-ink'
          }`}
        >
          Minha Função
          {minhaTarefaHoje?.status === 'pendente' && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-clay" />
          )}
        </button>

        {souFiscal && (
          <button
            onClick={() => setActiveTab('fiscal')}
            className={`flex-1 py-2 rounded-lg transition-colors text-center relative ${
              activeTab === 'fiscal' ? 'bg-forest text-white shadow-xs font-semibold' : 'text-muted hover:text-ink'
            }`}
          >
            Fiscal (Halls)
            {pendenciasFiscal > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-clay text-white text-[10px] font-bold">
                {pendenciasFiscal}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: QUADRO GERAL DA SEMANA                                             */}
      {/* ========================================================================= */}
      {activeTab === 'quadro' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted px-1">
            <span>Rodízio Linear dos 6 Quartos</span>
            <span>Reset às 01:00 BRT</span>
          </div>

          {(!quadro?.itens || quadro.itens.length === 0) && (
            <div className="p-6 rounded-2xl bg-surface border border-line text-center shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-cream border border-line flex items-center justify-center text-forest mx-auto">
                <Settings className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-ink">Escala Semanal Não Definida</h3>
              <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
                Nenhuma escala de faxina está ativa para a semana {quadro?.semana_ano || getIsoWeekAndYear().semana_ano}.
                Atribua os 6 quartos da casa para as 6 funções (Sala de TV, Sala de Estudos, Externo, Dispensa, Cozinha e Halls).
              </p>
              <div className="pt-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    carregarDadosIniciais();
                    setModalAdminOpen(true);
                  }}
                >
                  <Settings className="w-4 h-4 mr-1.5 inline" />
                  Definir Escala dos 6 Quartos
                </Button>
              </div>
            </div>
          )}

          {quadro?.itens.map((item) => {
            const tarefa = quadro.tarefas_hoje.find((t) => t.quarto_id === item.quarto_id);
            const isFiscal = item.area_comum?.nome === 'Halls';
            const temPenalidade = item.pontos_faltas >= 2;
            const regraAplicavel = obterRegraPorPontos(item.pontos_faltas, regrasPontos);

            return (
              <div
                key={item.quarto_id}
                className={`p-4 rounded-2xl border transition-all ${
                  temPenalidade
                    ? 'bg-clay-tint/40 border-clay/50 shadow-xs'
                    : isFiscal
                    ? 'bg-mint/30 border-forest/40'
                    : 'bg-surface border-line'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface border border-line flex items-center justify-center shrink-0">
                      {getAreaIcon(item.area_comum?.nome || '')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-ink">{item.quarto?.nome}</h4>
                        {isFiscal && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-forest text-white flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Fiscal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted font-medium mt-0.5">
                        {item.area_comum?.nome}
                      </p>
                    </div>
                  </div>

                  {/* Contador de Faltas da Semana */}
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted">Faltas:</span>
                      <span
                        className={`text-sm font-bold ${
                          temPenalidade ? 'text-clay font-black' : item.pontos_faltas > 0 ? 'text-amber-600' : 'text-forest'
                        }`}
                      >
                        {item.pontos_faltas}
                      </span>
                    </div>
                    {temPenalidade && (
                      <span className="text-[10px] text-clay font-bold block animate-pulse">
                        Penalidade!
                      </span>
                    )}
                  </div>
                </div>

                {/* Barra dos 7 Dias da Semana ISO (Seg a Dom) */}
                <div className="mt-3 pt-3 border-t border-line/60">
                  <div className="flex items-center justify-between text-[10px] text-muted mb-1.5">
                    <span className="font-semibold uppercase tracking-wider">Dias da Semana</span>
                    <span>Toque no dia enviado para ver a foto</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {diasDaSemana.map((dia) => {
                      const tarefaDia = quadro.tarefas_semana.find(
                        (t) => t.quarto_id === item.quarto_id && t.data === dia.data
                      );
                      const temFoto = Boolean(
                        tarefaDia?.status === 'cumprido' && tarefaDia?.fotos_comprovacao?.[0]
                      );
                      const foiReprovado = tarefaDia?.fiscal_status === 'reprovado';
                      const faltouDia = tarefaDia?.status === 'faltou';
                      const isHoje = dia.data === hojeStr;

                      let cellStyle = 'bg-cream/30 border-line/60 text-muted opacity-70';
                      if (temFoto) {
                        cellStyle = foiReprovado
                          ? 'border-clay bg-clay-tint text-clay hover:bg-clay-tint/80 cursor-pointer shadow-2xs'
                          : 'bg-mint/50 border-forest/40 text-forest hover:bg-mint cursor-pointer shadow-2xs';
                      } else if (faltouDia) {
                        cellStyle = 'bg-clay-tint/50 border-clay/30 text-clay';
                      } else if (isHoje) {
                        cellStyle = 'border-forest/40 bg-cream/60 text-ink font-semibold';
                      }

                      return (
                        <button
                          key={dia.data}
                          type="button"
                          disabled={!temFoto}
                          onClick={() => {
                            if (temFoto && tarefaDia) {
                              setTarefaDiaSelecionada({
                                tarefa: {
                                  ...tarefaDia,
                                  quarto: tarefaDia.quarto || item.quarto,
                                  area_comum: tarefaDia.area_comum || item.area_comum,
                                },
                                dia,
                              });
                            }
                          }}
                          title={
                            temFoto
                              ? `${dia.nomeCompleto} (${dia.diaMes}): Ver foto enviada por ${tarefaDia?.enviado_por_apelido || 'Morador'}`
                              : faltouDia
                              ? `${dia.nomeCompleto} (${dia.diaMes}): Faltou`
                              : `${dia.nomeCompleto} (${dia.diaMes}): Sem foto registrada`
                          }
                          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border text-center transition-all ${cellStyle}`}
                        >
                          <span className="text-[10px] font-bold leading-none">{dia.sigla}</span>
                          <span className="text-[9px] opacity-80 mt-0.5 leading-none">{dia.diaMes}</span>
                          <div className="mt-1 h-3.5 flex items-center justify-center">
                            {temFoto ? (
                              foiReprovado ? (
                                <AlertTriangle className="w-3 h-3 text-clay" />
                              ) : (
                                <Camera className="w-3 h-3 text-forest" />
                              )
                            ) : faltouDia ? (
                              <X className="w-3 h-3 text-clay" />
                            ) : isHoje ? (
                              <Clock className="w-3 h-3 text-forest/70" />
                            ) : (
                              <span className="w-1 h-1 rounded-full bg-line" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status da Faxina de Hoje */}
                <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {tarefa?.status === 'cumprido' ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (tarefa.fotos_comprovacao?.[0]) {
                            const diaHoje = diasDaSemana.find((d) => d.data === hojeStr) || {
                              sigla: 'Seg',
                              nomeCompleto: 'Hoje',
                              data: hojeStr,
                              diaMes: hojeStr.slice(5).split('-').reverse().join('/'),
                            };
                            setTarefaDiaSelecionada({
                              tarefa: {
                                ...tarefa,
                                quarto: tarefa.quarto || item.quarto,
                                area_comum: tarefa.area_comum || item.area_comum,
                              },
                              dia: diaHoje,
                            });
                          }
                        }}
                        className="text-forest flex items-center gap-1 font-medium hover:underline text-left"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Foto enviada hoje</span>
                        {tarefa.enviado_por_apelido && (
                          <span className="text-muted text-[11px]">({tarefa.enviado_por_apelido})</span>
                        )}
                      </button>
                    ) : tarefa?.status === 'faltou' ? (
                      <span className="text-clay flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Faltou ontem
                      </span>
                    ) : (
                      <span className="text-muted flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Pendente hoje (até 01h)
                      </span>
                    )}
                  </div>

                  {/* Parecer do Fiscal */}
                  {tarefa?.status === 'cumprido' && (
                    <div>
                      {tarefa.fiscal_status === 'aprovado' ? (
                        <Tag tone="green">Aprovado pelo Fiscal</Tag>
                      ) : tarefa.fiscal_status === 'reprovado' ? (
                        <Tag tone="alert">Reprovado</Tag>
                      ) : tarefa.fiscal_status === 'omitido' ? (
                        <Tag tone="alert">Fiscal Omitiu</Tag>
                      ) : (
                        <Tag tone="neutral">Aguardando Fiscal</Tag>
                      )}
                    </div>
                  )}
                </div>

                {/* Se reprovado, mostra observação */}
                {tarefa?.fiscal_status === 'reprovado' && tarefa.fiscal_observacao && (
                  <div className="mt-2 p-2 rounded-lg bg-surface text-[11px] text-clay border border-clay/20">
                    <strong>Motivo da reprovação:</strong> {tarefa.fiscal_observacao}
                  </div>
                )}

                {/* Penalidade progressiva aplicada ao quarto caso tenha faltas >= 2 */}
                {temPenalidade && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-clay-tint/70 border border-clay/40 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-clay uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-clay" />
                        Penalidade ({item.pontos_faltas} {item.pontos_faltas === 1 ? 'falta' : 'faltas'})
                      </span>
                      <Tag tone="alert">{item.pontos_faltas} Faltas</Tag>
                    </div>
                    <p className="mt-1 text-xs font-bold text-ink leading-snug">
                      {regraAplicavel?.descricao || item.penalidade_atribuida || quadro?.penalidade_semana}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: MINHA FUNÇÃO HOJE                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'minha_funcao' && (
        <div className="space-y-4">
          {!minhaEscala ? (
            <div className="p-6 rounded-2xl bg-surface border border-line text-center">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-ink">Quarto Não Identificado</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Seu cadastro ainda não está vinculado a um quarto ou a escala semanal ainda não foi iniciada. Solicite ao Administrador para vincular seu perfil.
              </p>
            </div>
          ) : (
            <>
              {/* Card da Função do Dia */}
              <div className="p-5 rounded-2xl bg-surface border border-line shadow-xs">
                <span className="text-[11px] text-muted uppercase font-bold tracking-wider">
                  Sua Função Nesta Semana ({minhaEscala.quarto?.nome})
                </span>
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-12 h-12 rounded-xl bg-cream border border-line flex items-center justify-center shrink-0">
                    {getAreaIcon(minhaEscala.area_comum?.nome || '')}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">{minhaEscala.area_comum?.nome}</h3>
                    <p className="text-xs text-muted leading-snug">
                      {minhaEscala.area_comum?.descricao || 'Organização e limpeza diária do espaço.'}
                    </p>
                  </div>
                </div>

                {/* Aviso especial se for o Fiscal */}
                {minhaEscala.area_comum?.nome === 'Halls' && (
                  <div className="mt-4 p-3 rounded-xl bg-mint/50 border border-forest/30 flex items-start gap-2.5 text-xs text-forest">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Seu quarto é o Fiscal da Semana!</strong> Além de fotografar o Hall limpo, vocês devem fiscalizar as outras 5 áreas da casa na aba <strong>Fiscal (Halls)</strong>.
                    </p>
                  </div>
                )}
              </div>

              {/* Status do Envio de Hoje */}
              <div className="p-5 rounded-2xl bg-surface border border-line shadow-xs">
                <h4 className="text-xs font-semibold text-ink uppercase tracking-wider mb-3">
                  Comprovação da Faxina de Hoje
                </h4>

                {/* Input de arquivo sempre montado para permitir envio inicial e substituição de foto */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {minhaTarefaHoje?.status === 'cumprido' ? (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300/80 text-xs text-ink space-y-1">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {minhaTarefaHoje.enviado_por_apelido || 'Um morador do seu quarto'} já enviou a foto de hoje!
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed pl-6">
                        A comprovação diária do seu quarto já está registrada abaixo. Se desejar, você pode enviar uma nova foto para substituí-la.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-mint/40 border border-forest/30 text-xs text-forest flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Foto registrada com sucesso por <strong>{minhaTarefaHoje.enviado_por_apelido || 'Morador'}</strong>!
                      </span>
                    </div>

                    {minhaTarefaHoje.fotos_comprovacao?.[0] && (
                      <div className="relative aspect-video rounded-xl overflow-hidden border border-line">
                        <img
                          src={minhaTarefaHoje.fotos_comprovacao[0]}
                          alt="Foto da limpeza enviada"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setImagemExpandida(minhaTarefaHoje.fotos_comprovacao[0])}
                        />
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-cream/60 border border-line text-xs flex items-center justify-between">
                      <span className="text-muted">Parecer do Fiscal:</span>
                      {minhaTarefaHoje.fiscal_status === 'aprovado' ? (
                        <Tag tone="green">Aprovado pelo Halls</Tag>
                      ) : minhaTarefaHoje.fiscal_status === 'reprovado' ? (
                        <Tag tone="alert">Reprovado</Tag>
                      ) : (
                        <Tag tone="neutral">Aguardando Avaliação</Tag>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      full
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5 inline" />
                      {uploading ? 'Substituindo foto...' : 'Substituir foto enviada'}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full aspect-video rounded-xl border-2 border-dashed border-line hover:border-forest/50 bg-cream/40 transition-colors flex flex-col items-center justify-center p-6 text-center cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center text-forest group-hover:scale-105 transition-transform mb-2">
                        <Camera className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-ink">
                        {uploading ? 'Processando foto...' : 'Tirar foto da área organizada'}
                      </span>
                      <span className="text-xs text-muted mt-0.5">
                        Prazo diário: até 01:00 da madrugada
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: PAINEL DO FISCAL (HALLS)                                           */}
      {/* ========================================================================= */}
      {activeTab === 'fiscal' && (
        <div className="space-y-4">
          {!souFiscal ? (
            <div className="p-6 rounded-2xl bg-surface border border-line text-center">
              <ShieldCheck className="w-8 h-8 text-muted mx-auto mb-2" />
              <h3 className="text-sm font-bold text-ink">Acesso Restrito ao Fiscal</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Nesta semana, a função de fiscalização está sob responsabilidade do{' '}
                <strong>{quadro?.quarto_fiscal_nome || 'quarto escalado no Halls'}</strong>. Apenas os moradores deste quarto e o Administrador podem dar o check.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-2xl bg-mint/40 border border-forest/30 text-xs text-forest flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Painel de Auditoria do Halls:</strong> Avalie o trabalho das outras 5 funções da casa. Você tem até as <strong>11:00 da manhã</strong> do dia seguinte para dar o parecer antes de tomar ponto por omissão.
                </p>
              </div>

              {/* Lista das outras 5 funções */}
              <div className="space-y-3">
                {quadro?.tarefas_hoje
                  .filter((t) => t.quarto_id !== quadro?.quarto_fiscal_id)
                  .map((t) => {
                    const foto = t.fotos_comprovacao?.[0];

                    return (
                      <div key={t.quarto_id} className="p-4 rounded-2xl bg-surface border border-line shadow-2xs">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            {getAreaIcon(t.area_comum?.nome || '')}
                            <div>
                              <h4 className="text-sm font-bold text-ink">{t.area_comum?.nome}</h4>
                              <p className="text-xs text-muted">{t.quarto?.nome}</p>
                            </div>
                          </div>

                          <div>
                            {t.fiscal_status === 'aprovado' ? (
                              <Tag tone="green">Aprovado</Tag>
                            ) : t.fiscal_status === 'reprovado' ? (
                              <Tag tone="alert">Reprovado</Tag>
                            ) : t.fiscal_status === 'omitido' ? (
                              <Tag tone="alert">Omitido</Tag>
                            ) : (
                              <Tag tone="neutral">Pendente</Tag>
                            )}
                          </div>
                        </div>

                        {/* Foto e Ações */}
                        {foto ? (
                          <div className="space-y-3">
                            <div className="relative aspect-video rounded-xl overflow-hidden border border-line">
                              <img
                                src={foto}
                                alt={`Foto ${t.area_comum?.nome}`}
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => setImagemExpandida(foto)}
                              />
                              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-ink/70 text-white text-[10px] backdrop-blur">
                                Enviada por: {t.enviado_por_apelido || 'Morador'}
                              </div>
                            </div>

                            {t.fiscal_status === 'pendente' && (
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <Button
                                  variant="primary"
                                  onClick={() => {
                                    setTarefaFiscalizando(t);
                                    setFiscalDecisao('aprovado');
                                  }}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" />
                                  Aprovar
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setTarefaFiscalizando(t);
                                    setFiscalDecisao('reprovado');
                                  }}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 mr-1 inline text-clay" />
                                  Reprovar
                                </Button>
                              </div>
                            )}

                            {t.fiscal_status !== 'pendente' && (
                              <div className="flex items-center justify-between text-xs text-muted pt-1">
                                <span>
                                  Avaliado por: <strong>{t.fiscalizado_por_apelido || 'Fiscal'}</strong>
                                </span>
                                <button
                                  onClick={() => {
                                    setTarefaFiscalizando(t);
                                    setFiscalDecisao(t.fiscal_status === 'reprovado' ? 'reprovado' : 'aprovado');
                                    setFiscalObservacao(t.fiscal_observacao || '');
                                  }}
                                  className="text-forest underline text-xs font-medium"
                                >
                                  Editar parecer
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-cream/40 border border-line text-xs text-muted flex items-center gap-2">
                            <Clock className="w-4 h-4 shrink-0" />
                            <span>Quarto ainda não enviou a foto da faxina de hoje.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE DECISÃO DO FISCAL (CHECK / REPROVAÇÃO)                           */}
      {/* ========================================================================= */}
      {tarefaFiscalizando && fiscalDecisao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
          <div className="bg-surface w-full max-w-sm rounded-2xl p-5 border border-line shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-ink">
                {fiscalDecisao === 'aprovado' ? 'Aprovar Limpeza' : 'Reprovar Faxina (Gera Ponto)'}
              </h3>
              <button
                onClick={() => setTarefaFiscalizando(null)}
                className="text-muted hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-muted mb-4">
              Função: <strong>{tarefaFiscalizando.area_comum?.nome}</strong> ({tarefaFiscalizando.quarto?.nome})
            </p>

            {fiscalDecisao === 'reprovado' && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1">
                    Justificativa da Reprovação <span className="text-clay">*</span>
                  </label>
                  <textarea
                    required
                    value={fiscalObservacao}
                    onChange={(e) => setFiscalObservacao(e.target.value)}
                    placeholder="Ex: Pia ainda estava cheia de louça e a mesa suja."
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-line text-xs text-ink focus:outline-none focus:border-forest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink uppercase mb-1">
                    Foto de Contraprova (Opcional)
                  </label>
                  <input
                    ref={fiscalFileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFiscalFotoFile(file);
                        setFiscalFotoPreview(URL.createObjectURL(file));
                      }
                    }}
                    className="hidden"
                  />
                  {fiscalFotoPreview ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden border border-line">
                      <img src={fiscalFotoPreview} alt="Contraprova" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setFiscalFotoPreview(null);
                          setFiscalFotoFile(null);
                        }}
                        className="absolute top-2 right-2 p-1 rounded-full bg-ink/70 text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      full
                      onClick={() => fiscalFileInputRef.current?.click()}
                    >
                      <Camera className="w-3.5 h-3.5 mr-1 inline" />
                      Tirar foto de contraprova
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" full onClick={() => setTarefaFiscalizando(null)}>
                Cancelar
              </Button>
              <Button
                variant={fiscalDecisao === 'aprovado' ? 'primary' : 'outline'}
                full
                disabled={enviandoFiscal || (fiscalDecisao === 'reprovado' && !fiscalObservacao.trim())}
                onClick={handleSalvarFiscalizacao}
              >
                {enviandoFiscal ? 'Salvando...' : 'Confirmar Avaliação'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE DETALHES DA FOTO DO DIA (SEMANA)                                 */}
      {/* ========================================================================= */}
      {tarefaDiaSelecionada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-xs"
          onClick={() => setTarefaDiaSelecionada(null)}
        >
          <div
            className="bg-surface w-full max-w-md rounded-2xl p-5 border border-line shadow-xl space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cream border border-line flex items-center justify-center shrink-0">
                  {getAreaIcon(tarefaDiaSelecionada.tarefa.area_comum?.nome || '')}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    {tarefaDiaSelecionada.tarefa.quarto?.nome} · {tarefaDiaSelecionada.tarefa.area_comum?.nome}
                  </h3>
                  <p className="text-xs text-muted">
                    {tarefaDiaSelecionada.dia.nomeCompleto} ({tarefaDiaSelecionada.dia.diaMes})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTarefaDiaSelecionada(null)}
                className="text-muted hover:text-ink p-1"
                aria-label="Fechar detalhes da foto"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {tarefaDiaSelecionada.tarefa.fotos_comprovacao?.[0] && (
              <div className="relative aspect-video rounded-xl overflow-hidden border border-line bg-ink/5">
                <img
                  src={tarefaDiaSelecionada.tarefa.fotos_comprovacao[0]}
                  alt={`Comprovação ${tarefaDiaSelecionada.tarefa.quarto?.nome} em ${tarefaDiaSelecionada.dia.diaMes}`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setImagemExpandida(tarefaDiaSelecionada.tarefa.fotos_comprovacao[0])}
                />
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-ink/75 text-white text-[10px] backdrop-blur">
                  Toque para ampliar
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-cream/50 border border-line text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted">Enviada por:</span>
                <span className="font-bold text-ink">
                  {tarefaDiaSelecionada.tarefa.enviado_por_apelido || 'Morador do quarto'}
                </span>
              </div>

              {tarefaDiaSelecionada.tarefa.enviado_em && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Horário do envio:</span>
                  <span className="font-medium text-ink">
                    {new Date(tarefaDiaSelecionada.tarefa.enviado_em).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <span className="text-muted">Parecer do Fiscal (Halls):</span>
                {tarefaDiaSelecionada.tarefa.fiscal_status === 'aprovado' ? (
                  <Tag tone="green">Aprovado pelo Halls</Tag>
                ) : tarefaDiaSelecionada.tarefa.fiscal_status === 'reprovado' ? (
                  <Tag tone="alert">Reprovado</Tag>
                ) : tarefaDiaSelecionada.tarefa.fiscal_status === 'omitido' ? (
                  <Tag tone="alert">Fiscal Omitiu</Tag>
                ) : (
                  <Tag tone="neutral">Aguardando Fiscal</Tag>
                )}
              </div>
            </div>

            {tarefaDiaSelecionada.tarefa.fiscal_status === 'reprovado' && (
              <div className="p-3 rounded-xl bg-clay-tint/50 border border-clay/30 text-xs text-clay space-y-2">
                {tarefaDiaSelecionada.tarefa.fiscal_observacao && (
                  <p>
                    <strong>Justificativa do Fiscal:</strong> {tarefaDiaSelecionada.tarefa.fiscal_observacao}
                  </p>
                )}
                {tarefaDiaSelecionada.tarefa.fiscal_foto_url && (
                  <div>
                    <span className="block text-[11px] font-semibold mb-1">Foto de contraprova do Fiscal:</span>
                    <img
                      src={tarefaDiaSelecionada.tarefa.fiscal_foto_url}
                      alt="Contraprova do Fiscal"
                      className="w-full h-36 object-cover rounded-lg border border-clay/30 cursor-pointer"
                      onClick={() => setImagemExpandida(tarefaDiaSelecionada.tarefa.fiscal_foto_url!)}
                    />
                  </div>
                )}
              </div>
            )}

            <Button variant="outline" full onClick={() => setTarefaDiaSelecionada(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE FOTO EXPANDIDA EM TELA CHEIA                                     */}
      {/* ========================================================================= */}
      {imagemExpandida && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/90 backdrop-blur"
          onClick={() => setImagemExpandida(null)}
        >
          <div className="relative max-w-lg w-full">
            <button
              onClick={() => setImagemExpandida(null)}
              className="absolute -top-10 right-0 text-white text-sm flex items-center gap-1"
            >
              <X className="w-5 h-5" /> Fechar
            </button>
            <img
              src={imagemExpandida}
              alt="Foto ampliada"
              className="w-full rounded-2xl max-h-[80vh] object-contain mx-auto"
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE ADMINISTRAÇÃO E INICIALIZAÇÃO DE ESCALA                          */}
      {/* ========================================================================= */}
      {modalAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-xs">
          <div className="bg-surface w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 border border-line shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-forest text-white flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Administração da Faxina</h3>
                  <p className="text-[11px] text-muted">Configuração da escala e simulações</p>
                </div>
              </div>
              <button onClick={() => setModalAdminOpen(false)} className="text-muted hover:text-ink p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {adminAcaoMsg && (
              <div className="p-3 rounded-xl bg-mint/50 border border-forest/30 text-xs text-forest">
                {adminAcaoMsg}
              </div>
            )}

            {/* Abas do Modal Admin: Escala vs Regras */}
            <div className="flex rounded-xl bg-cream border border-line p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setModalAdminTab('escala')}
                className={`flex-1 py-1.5 rounded-lg transition-colors text-center ${
                  modalAdminTab === 'escala'
                    ? 'bg-forest text-white font-semibold shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Escala dos 6 Quartos
              </button>
              <button
                type="button"
                onClick={() => setModalAdminTab('regras')}
                className={`flex-1 py-1.5 rounded-lg transition-colors text-center ${
                  modalAdminTab === 'regras'
                    ? 'bg-forest text-white font-semibold shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Regras (2 a 7 Pontos)
              </button>
            </div>

            {/* ABA ADMIN 1: ESCALA DOS 6 QUARTOS */}
            {modalAdminTab === 'escala' && (
              <>
                {loadingDadosIniciais && !dadosIniciais ? (
                  <div className="py-12 text-center">
                    <div className="w-8 h-8 border-2 border-forest border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-muted">Carregando quartos e funções da república...</p>
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    {/* Cabeçalho da Escala */}
                    <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
                      <div>
                        <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                          Definir Escala dos 6 Quartos
                        </h4>
                        <p className="text-[11px] text-muted">
                          Atribua 1 quarto para cada função. O Halls é o fiscal.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAtribuicaoRapida}
                        className="flex items-center gap-1 text-[11px] font-semibold text-forest hover:text-forest-hover bg-mint/50 px-2 py-1 rounded-lg border border-forest/20 shrink-0 transition-colors"
                        title="Preenche automaticamente 1 quarto para cada função"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Auto 1:1</span>
                      </button>
                    </div>

                    {/* Lista das 6 Funções */}
                    <div className="space-y-2.5">
                      {(() => {
                        const areasParaExibir: AreaComum[] =
                          dadosIniciais?.areas && dadosIniciais.areas.length > 0
                            ? dadosIniciais.areas
                            : FUNCOES_CANONICAS.map((f, i) => ({
                                id: `canonico-${i}`,
                                nome: f.nome,
                                descricao: f.descricao,
                              }));

                        const roomsParaExibir: Quarto[] =
                          dadosIniciais?.rooms && dadosIniciais.rooms.length > 0
                            ? dadosIniciais.rooms
                            : QUARTOS_CANONICOS.map((q, i) => ({
                                id: `quarto-canonico-${i}`,
                                nome: q,
                                capacidade: 4,
                              }));

                        return areasParaExibir.map((area) => {
                          const isHalls = area.nome === 'Halls';
                          const quartoSelecionado = atribuicoesForm[area.id] || '';

                          return (
                            <div
                              key={area.id}
                              className={`p-3 rounded-xl border transition-all ${
                                isHalls
                                  ? 'bg-mint/20 border-forest/30'
                                  : 'bg-cream/30 border-line'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-ink">
                                  {getAreaIcon(area.nome)}
                                  <span>{area.nome}</span>
                                  {isHalls && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-forest text-white font-semibold">
                                      Fiscal
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-muted truncate max-w-[150px]">
                                  {area.descricao}
                                </span>
                              </div>

                              <select
                                value={quartoSelecionado}
                                onChange={(e) =>
                                  setAtribuicoesForm((prev) => ({
                                    ...prev,
                                    [area.id]: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest"
                              >
                                <option value="">Selecione o quarto responsável...</option>
                                {roomsParaExibir.map((room) => (
                                  <option key={room.id} value={room.id}>
                                    {room.nome}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Status de Validação */}
                    {(() => {
                      const selecionados = Object.values(atribuicoesForm).filter(Boolean);
                      const unicos = new Set(selecionados).size;
                      const temDuplicidade = selecionados.length > unicos;

                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs px-1">
                            <span className="text-muted">Quartos selecionados:</span>
                            <span
                              className={`font-bold ${
                                unicos === 6 && !temDuplicidade
                                  ? 'text-forest'
                                  : 'text-amber-600'
                              }`}
                            >
                              {unicos} de 6
                            </span>
                          </div>

                          {temDuplicidade && (
                            <div className="p-2.5 rounded-xl bg-clay-tint/50 border border-clay/30 text-clay text-xs flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Cada quarto deve assumir apenas 1 função nesta semana.</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Penalidade Base da Semana */}
                    <div className="pt-2">
                      <label className="block text-xs font-semibold text-ink uppercase mb-1">
                        Penalidade Base da Semana (≥ 2 Faltas):
                      </label>
                      <input
                        type="text"
                        value={penalidadeForm}
                        onChange={(e) => setPenalidadeForm(e.target.value)}
                        placeholder="Ex: Pagar 1 caixa de cerveja para a casa"
                        className="w-full px-3 py-2 rounded-xl border border-line text-xs text-ink focus:outline-none focus:border-forest"
                      />
                    </div>

                    <Button
                      variant="primary"
                      full
                      disabled={salvandoEscala}
                      onClick={handleSalvarInicializacao}
                    >
                      {salvandoEscala ? 'Salvando escala...' : 'Salvar e Iniciar Escala'}
                    </Button>
                  </div>
                )}

                {/* Testes Manuais de Rotinas Backend */}
                <div className="pt-4 border-t border-line space-y-2">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Simulações do Backend (Testes)
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={handleSimularCorte01h}>
                      Simular Corte 01h
                    </Button>
                    <Button variant="outline" onClick={handleSimularAuditoria11h}>
                      Simular Auditoria 11h
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* ABA ADMIN 2: REGRAS DE 2 A 7 PONTOS */}
            {modalAdminTab === 'regras' && (
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between border-b border-line/60 pb-2">
                  <div>
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                      Regras de Penalidades (2 a 7 Faltas)
                    </h4>
                    <p className="text-[11px] text-muted">
                      Defina a consequência acumulada para cada número de faltas da semana.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestaurarRegrasPadrao}
                    className="text-[11px] font-semibold text-forest hover:underline shrink-0"
                  >
                    Restaurar Padrões
                  </button>
                </div>

                <div className="space-y-2.5">
                  {[2, 3, 4, 5, 6, 7].map((pts) => (
                    <div
                      key={pts}
                      className="p-3 rounded-xl bg-cream/30 border border-line space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-clay-tint text-clay border border-clay/30 flex items-center justify-center text-[11px] font-bold">
                            {pts}
                          </span>
                          <span>{pts} {pts === 1 ? 'Falta' : 'Faltas'} no Quadro</span>
                        </label>
                        {pts === 2 && (
                          <span className="text-[10px] text-muted font-medium">Início das penalidades</span>
                        )}
                        {pts === 7 && (
                          <span className="text-[10px] text-clay font-bold">Pena máxima</span>
                        )}
                      </div>

                      <input
                        type="text"
                        value={regrasForm[pts] ?? ''}
                        onChange={(e) =>
                          setRegrasForm((prev) => ({
                            ...prev,
                            [pts]: e.target.value,
                          }))
                        }
                        placeholder={`Penalidade para ${pts} faltas...`}
                        className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-xs focus:outline-none focus:border-forest"
                      />
                    </div>
                  ))}
                </div>

                <Button
                  variant="primary"
                  full
                  disabled={salvandoRegras}
                  onClick={handleSalvarRegras}
                >
                  {salvandoRegras ? 'Salvando regras...' : 'Salvar Regras de 2 a 7 Pontos'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
