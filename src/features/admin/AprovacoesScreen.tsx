import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile, Room, UserRole } from '../../types/auth';
import { PageTitle, Tag } from '../../components/ui';
import {
  validarAcoesAdmin,
  validarEdicaoMoradorAdmin,
  validarEdicaoConvidadoAdmin,
} from '../perfil/perfilLogic';
import {
  Check,
  X,
  Edit2,
  Users,
  Clock,
  UserCheck,
  UserX,
  AlertCircle,
  Phone,
  Shield,
  Trash2,
  Home,
  Gavel,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';

export type TabMode = 'pendentes' | 'moradores' | 'convidados' | 'pontos_reuniao';

interface AprovacoesScreenProps {
  onBack: () => void;
  initialTab?: TabMode;
}

export const AprovacoesScreen: React.FC<AprovacoesScreenProps> = ({ onBack, initialTab = 'pendentes' }) => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabMode>(initialTab);
  const [pendentes, setPendentes] = useState<Profile[]>([]);
  const [moradores, setMoradores] = useState<Profile[]>([]);
  const [convidados, setConvidados] = useState<Profile[]>([]);
  const [pontosReuniao, setPontosReuniao] = useState<any[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [modalAtribuirPonto, setModalAtribuirPonto] = useState<any | null>(null);
  const [culpadoReuniaoId, setCulpadoReuniaoId] = useState<string>('');
  const [atribuindoReuniao, setAtribuindoReuniao] = useState(false);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [editingMorador, setEditingMorador] = useState<Profile | null>(null);
  const [editApelido, setEditApelido] = useState('');
  const [editNome, setEditNome] = useState('');
  const [editGeracao, setEditGeracao] = useState('');
  const [editQuartoId, setEditQuartoId] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('morador');
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);

  const [editingConvidado, setEditingConvidado] = useState<Profile | null>(null);
  const [editConvApelido, setEditConvApelido] = useState('');
  const [editConvNome, setEditConvNome] = useState('');
  const [editConvTelefone, setEditConvTelefone] = useState('');

  // Carrega lista de quartos
  useEffect(() => {
    supabase
      .from('rooms')
      .select('*')
      .order('nome')
      .then(({ data }) => {
        if (data) setRooms(data);
      });
  }, []);

  // Carrega todas as 3 listas
  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, quarto:rooms(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const perfis = data as Profile[];

        // 1. Pendentes: qualquer perfil com ativo = false (exceto se for externo desativado por admin, ou cadastros pendentes)
        const pend = perfis.filter((p) => p.ativo === false && p.role !== 'externo');
        setPendentes(pend);

        // 2. Moradores Ativos: role IN ('morador', 'admin') e ativo = true
        const morad = perfis
          .filter((p) => (p.role === 'morador' || p.role === 'admin') && p.ativo === true)
          .sort((a, b) => {
            const nomeA = (a.apelido || a.nome).toLowerCase();
            const nomeB = (b.apelido || b.nome).toLowerCase();
            return nomeA.localeCompare(nomeB);
          });
        setMoradores(morad);

        // 3. Convidados Externos: role = 'externo'
        const conv = perfis
          .filter((p) => p.role === 'externo')
          .sort((a, b) => {
            if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
            const nomeA = (a.apelido || a.nome).toLowerCase();
            const nomeB = (b.apelido || b.nome).toLowerCase();
            return nomeA.localeCompare(nomeB);
          });
        setConvidados(conv);

        // 4. Pontos de Bagunça encaminhados para Deliberação em Reunião
        const perfisMap: Record<string, Profile> = {};
        perfis.forEach((p) => {
          perfisMap[p.id] = p;
        });

        const { data: pontosReuniaoData, error: pontosReuniaoErr } = await supabase
          .from('pontos_bagunca')
          .select(`
            id, relator_id, local_descricao, foto_url, status, created_at,
            culpados:pontos_bagunca_culpados(id, morador_id, assumido_em),
            acusacoes:pontos_bagunca_acusacoes(id, acusado_id, acusador_id, status, created_at),
            visualizacoes:pontos_bagunca_visualizacoes(ponto_id, morador_id, declarou_inocente, inocente_em)
          `)
          .eq('status', 'reuniao')
          .order('created_at', { ascending: false });

        if (!pontosReuniaoErr && pontosReuniaoData) {
          const pontosIds = pontosReuniaoData.map((p: any) => p.id);
          let msgsMap: Record<string, any[]> = {};

          if (pontosIds.length > 0) {
            const { data: msgsData } = await supabase
              .from('mensagens_ponto_bagunca')
              .select('id, ponto_bagunca_id, autor_id, conteudo, enviada_em')
              .in('ponto_bagunca_id', pontosIds)
              .order('enviada_em', { ascending: true });

            (msgsData || []).forEach((m: any) => {
              if (!msgsMap[m.ponto_bagunca_id]) msgsMap[m.ponto_bagunca_id] = [];
              msgsMap[m.ponto_bagunca_id].push({
                ...m,
                autor: perfisMap[m.autor_id] || null,
              });
            });
          }

          const pontosFormatados = pontosReuniaoData.map((p: any) => ({
            ...p,
            relator: perfisMap[p.relator_id] || null,
            mensagens: msgsMap[p.id] || [],
            inocentes: (p.visualizacoes || [])
              .filter((v: any) => v.declarou_inocente)
              .map((v: any) => perfisMap[v.morador_id])
              .filter(Boolean),
            acusacoesFormatadas: (p.acusacoes || []).map((a: any) => ({
              ...a,
              acusado: perfisMap[a.acusado_id] || null,
              acusador: perfisMap[a.acusador_id] || null,
            })),
          }));

          setPontosReuniao(pontosFormatados);
        }
      }
    } catch (err: any) {
      console.error('[AprovacoesScreen] Erro ao carregar dados:', err);
      setErrorMessage(err.message || 'Erro ao carregar lista de membros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Ações de Pontos em Reunião
  const handleAnularPontoReuniao = async (pontoId: string) => {
    if (!confirm('Deseja realmente anular/deletar este ponto de bagunça? Ele será excluído sem gerar penalidades.')) return;
    setActionLoading(pontoId);
    try {
      const { error } = await supabase.from('pontos_bagunca').delete().eq('id', pontoId);
      if (error) throw error;
      showSuccess('Ponto de bagunça anulado e removido com sucesso.');
      await carregarDados();
    } catch (err: any) {
      setErrorMessage('Erro ao anular ponto: ' + (err.message || err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAtribuirPontoReuniao = async () => {
    if (!modalAtribuirPonto || !culpadoReuniaoId) return;
    setAtribuindoReuniao(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.rpc('admin_atribuir_ponto_reuniao', {
        p_ponto_id: modalAtribuirPonto.id,
        p_morador_id: culpadoReuniaoId,
      });

      if (error) throw error;

      showSuccess('Ponto atribuído na reunião! Total de 2 penalidades garantidas ao culpado.');
      setModalAtribuirPonto(null);
      setCulpadoReuniaoId('');
      await carregarDados();
    } catch (err: any) {
      setErrorMessage('Erro ao atribuir ponto na reunião: ' + (err.message || err));
    } finally {
      setAtribuindoReuniao(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  // ----------------------------------------------------
  // AÇÕES: PENDENTES
  // ----------------------------------------------------
  const handleAprovar = async (id: string) => {
    setActionLoading(id);
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ativo: true, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      showSuccess('Morador aprovado com sucesso!');
      await carregarDados();
    } catch (err: any) {
      setErrorMessage('Erro ao aprovar morador: ' + (err.message || err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecusarPendente = async (id: string) => {
    if (!confirm('Deseja recusar e remover esta solicitação de morador?')) return;
    setActionLoading(id);
    setErrorMessage(null);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;

      showSuccess('Solicitação recusada e removida.');
      await carregarDados();
    } catch (err: any) {
      setErrorMessage('Erro ao recusar solicitação: ' + (err.message || err));
    } finally {
      setActionLoading(null);
    }
  };

  // ----------------------------------------------------
  // AÇÕES: MORADORES ATIVOS
  // ----------------------------------------------------
  const handleAbrirEdicaoMorador = (m: Profile) => {
    setEditingMorador(m);
    setEditApelido(m.apelido || '');
    setEditNome(m.nome || '');
    setEditGeracao(m.geracao || '025');
    setEditQuartoId(m.quarto_id || (rooms[0]?.id || ''));
    setEditRole(m.role || 'morador');
    setEditAvatarUrl(m.avatar_url || null);
  };

  const handleSalvarEdicaoMorador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMorador) return;

    setErrorMessage(null);
    setActionLoading(editingMorador.id);

    try {
      const payload = validarEdicaoMoradorAdmin({
        apelido: editApelido,
        nome: editNome,
        geracao: editGeracao,
        quarto_id: editQuartoId || null,
        role: editRole,
        avatar_url: editAvatarUrl,
      });

      // Validação de segurança se for o próprio admin logado
      if (user?.id) {
        const check = validarAcoesAdmin({
          adminLogadoId: user.id,
          alvoId: editingMorador.id,
          acao: editRole !== 'admin' ? 'rebaixar' : 'editar',
          novoRole: editRole,
        });

        if (!check.permitido) {
          throw new Error(check.motivo);
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          apelido: payload.apelido,
          nome: payload.nome,
          geracao: payload.geracao,
          quarto_id: payload.quarto_id,
          role: payload.role,
          avatar_url: editAvatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMorador.id);

      if (error) throw error;

      showSuccess('Dados do morador atualizados com sucesso!');
      setEditingMorador(null);
      await carregarDados();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao atualizar morador.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDesativarMorador = async (m: Profile) => {
    if (user?.id) {
      const check = validarAcoesAdmin({
        adminLogadoId: user.id,
        alvoId: m.id,
        acao: 'desativar',
        novoAtivo: false,
      });
      if (!check.permitido) {
        alert(check.motivo);
        return;
      }
    }

    const apelidoExibicao = m.apelido || m.nome;
    if (
      !confirm(
        `Tem certeza que deseja desativar o acesso de ${apelidoExibicao}? O morador não conseguirá mais entrar no app.`
      )
    ) {
      return;
    }

    setActionLoading(m.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', m.id);

      if (error) throw error;

      showSuccess(`Acesso de ${apelidoExibicao} desativado.`);
      setEditingMorador(null);
      await carregarDados();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao desativar morador.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoverMorador = async (m: Profile) => {
    if (user?.id) {
      const check = validarAcoesAdmin({
        adminLogadoId: user.id,
        alvoId: m.id,
        acao: 'excluir',
      });
      if (!check.permitido) {
        alert(check.motivo);
        return;
      }
    }

    const apelidoExibicao = m.apelido || m.nome;
    if (
      !confirm(
        `ATENÇÃO: Deseja excluir permanentemente o cadastro de ${apelidoExibicao}? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }

    setActionLoading(m.id);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', m.id);
      if (error) throw error;

      showSuccess(`Conta de ${apelidoExibicao} removida.`);
      setEditingMorador(null);
      await carregarDados();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao remover morador.');
    } finally {
      setActionLoading(null);
    }
  };

  // ----------------------------------------------------
  // AÇÕES: CONVIDADOS EXTERNOS
  // ----------------------------------------------------
  const handleToggleAtivoConvidado = async (conv: Profile) => {
    const novoStatus = !conv.ativo;
    setActionLoading(conv.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ativo: novoStatus, updated_at: new Date().toISOString() })
        .eq('id', conv.id);

      if (error) throw error;

      showSuccess(
        `Convidado ${conv.apelido || conv.nome} ${novoStatus ? 'ativado' : 'desativado'}.`
      );
      await carregarDados();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao atualizar status do convidado.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAbrirEdicaoConvidado = (conv: Profile) => {
    setEditingConvidado(conv);
    setEditConvApelido(conv.apelido || '');
    setEditConvNome(conv.nome || '');
    setEditConvTelefone(conv.telefone_contato || '');
  };

  const handleSalvarEdicaoConvidado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConvidado) return;

    setActionLoading(editingConvidado.id);
    try {
      const payload = validarEdicaoConvidadoAdmin({
        apelido: editConvApelido,
        nome: editConvNome,
        telefone_contato: editConvTelefone,
      });

      const { error } = await supabase
        .from('profiles')
        .update({
          apelido: payload.apelido,
          nome: payload.nome,
          telefone_contato: payload.telefone_contato,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingConvidado.id);

      if (error) throw error;

      showSuccess('Convidado atualizado com sucesso!');
      setEditingConvidado(null);
      await carregarDados();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao atualizar convidado.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoverConvidado = async (conv: Profile) => {
    if (!confirm(`Deseja remover o convidado ${conv.apelido || conv.nome}?`)) return;

    setActionLoading(conv.id);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', conv.id);
      if (error) throw error;

      showSuccess('Convidado removido.');
      await carregarDados();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao remover convidado.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <>
      <PageTitle
        title="Gestão de Membros"
        hint="Controle de acesso, moradores e convidados (Admin)"
        back={{ label: 'Casa', onClick: onBack }}
      />

      {/* Seletor de 3 Abas */}
      <div className="flex border-b border-line mb-5">
        <button
          onClick={() => setActiveTab('pendentes')}
          className={`flex-1 pb-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'pendentes'
              ? 'border-forest text-forest'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Pendentes ({pendentes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('moradores')}
          className={`flex-1 pb-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'moradores'
              ? 'border-forest text-forest'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Moradores ({moradores.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('convidados')}
          className={`flex-1 pb-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'convidados'
              ? 'border-forest text-forest'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Convidados ({convidados.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pontos_reuniao')}
          className={`flex-1 pb-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'pontos_reuniao'
              ? 'border-forest text-forest'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Gavel className="w-3.5 h-3.5" />
          <span>Reunião ({pontosReuniao.length})</span>
        </button>
      </div>

      {successMessage && (
        <div className="mb-4 p-3 rounded-xl bg-mint/50 border border-mint text-forest text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-clay-tint border border-clay/30 text-clay text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted py-8 text-center">Buscando cadastros no Supabase...</p>
      ) : (
        <>
          {/* ========================================================== */}
          {/* ABA 1: PENDENTES */}
          {/* ========================================================== */}
          {activeTab === 'pendentes' && (
            <div className="space-y-3">
              {pendentes.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-mint text-forest flex items-center justify-center mx-auto mb-3">
                    <Check className="w-5 h-5" />
                  </div>
                  <h4 className="text-base font-semibold text-ink">Nenhuma solicitação pendente</h4>
                  <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                    Todos os moradores cadastrados já foram aprovados. Novos cadastros aparecerão aqui.
                  </p>
                </div>
              ) : (
                pendentes.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl border border-line bg-surface space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {p.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            alt={p.apelido || p.nome}
                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-line"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-mint text-forest font-bold text-sm flex items-center justify-center shrink-0">
                            {(p.apelido || p.nome).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-ink">
                            {p.apelido || p.nome}
                          </h4>
                          <p className="text-xs text-muted mt-0.5">
                            Nome civil: {p.nome}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            Geração {p.geracao || '025'} · {p.quarto?.nome || 'Quarto não definido'}
                          </p>
                          <p className="text-[11px] text-muted/80 font-mono mt-0.5">{p.email}</p>
                        </div>
                      </div>
                      <Tag tone="alert">Pendente</Tag>
                    </div>

                    <div className="flex gap-2 pt-1 border-t border-line">
                      <button
                        onClick={() => handleAprovar(p.id)}
                        disabled={actionLoading === p.id}
                        className="flex-1 py-2 px-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {actionLoading === p.id ? 'Aprovando...' : 'Aprovar Morador'}
                      </button>

                      <button
                        onClick={() => handleRecusarPendente(p.id)}
                        disabled={actionLoading === p.id}
                        className="py-2 px-3 rounded-lg border border-line bg-paper hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" /> Recusar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* ABA 2: MORADORES ATIVOS */}
          {/* ========================================================== */}
          {activeTab === 'moradores' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted">
                {moradores.length} {moradores.length === 1 ? 'morador ativo' : 'moradores ativos'} na república
              </p>

              {moradores.map((m) => {
                const isProprio = m.id === user?.id;
                const inicial = (m.apelido || m.nome).charAt(0).toUpperCase();

                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-line bg-surface flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt={m.apelido || m.nome}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-line shadow-2xs"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-mint text-forest font-bold text-sm flex items-center justify-center shrink-0">
                          {inicial}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-ink truncate">
                            {m.apelido || m.nome}
                          </h4>
                          {isProprio && (
                            <span className="text-[10px] font-semibold text-muted bg-line px-1.5 py-0.5 rounded">
                              Você
                            </span>
                          )}
                          <Tag tone={m.role === 'admin' ? 'green' : 'neutral'}>
                            {m.role === 'admin' ? 'Admin' : 'Morador'}
                          </Tag>
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
                          {m.nome} · 0{m.geracao ? m.geracao.replace(/^0+/, '') : '25'}
                        </p>
                        <p className="text-[11px] text-muted/80 flex items-center gap-1 mt-0.5 truncate">
                          <Home className="w-3 h-3 text-forest shrink-0" />
                          <span>{m.quarto?.nome || 'Sem quarto definido'}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAbrirEdicaoMorador(m)}
                      className="px-3 py-1.5 rounded-lg border border-line bg-paper hover:border-muted text-ink text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ========================================================== */}
          {/* ABA 3: CONVIDADOS EXTERNOS */}
          {/* ========================================================== */}
          {activeTab === 'convidados' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted">
                {convidados.length} {convidados.length === 1 ? 'convidado cadastrado' : 'convidados cadastrados'}
              </p>

              {convidados.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-line text-muted flex items-center justify-center mx-auto mb-3">
                    <Users className="w-5 h-5" />
                  </div>
                  <h4 className="text-base font-semibold text-ink">Nenhum convidado cadastrado</h4>
                  <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                    Membros externos convidados via link de convite aparecerão nesta aba.
                  </p>
                </div>
              ) : (
                convidados.map((conv) => {
                  const whatsAppDigits = conv.telefone_contato?.replace(/\D/g, '') || '';
                  const whatsAppUrl = whatsAppDigits ? `https://wa.me/55${whatsAppDigits}` : null;

                  return (
                    <div
                      key={conv.id}
                      className="p-4 rounded-xl border border-line bg-surface space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {conv.avatar_url ? (
                            <img
                              src={conv.avatar_url}
                              alt={conv.apelido || conv.nome}
                              className="w-10 h-10 rounded-full object-cover shrink-0 border border-line"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-line text-muted font-bold text-sm flex items-center justify-center shrink-0">
                              {(conv.apelido || conv.nome).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-ink truncate">
                                {conv.apelido || conv.nome}
                              </h4>
                              <Tag tone={conv.ativo ? 'green' : 'alert'}>
                                {conv.ativo ? 'Ativo' : 'Desativado'}
                              </Tag>
                            </div>
                            {conv.nome && conv.nome !== conv.apelido && (
                              <p className="text-xs text-muted mt-0.5">{conv.nome}</p>
                            )}
                            <p className="text-xs text-muted flex items-center gap-1.5 mt-1 font-mono">
                              <Phone className="w-3 h-3 text-forest" />
                              <span>{conv.telefone_contato || 'Sem telefone'}</span>
                            </p>
                            <p className="text-[11px] text-muted/70 font-mono mt-0.5">{conv.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {whatsAppUrl && (
                            <a
                              href={whatsAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-mint text-forest hover:bg-mint/80 transition-colors"
                              title="Abrir WhatsApp"
                            >
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => handleAbrirEdicaoConvidado(conv)}
                            className="p-2 rounded-lg border border-line bg-paper hover:border-muted text-ink transition-colors"
                            title="Editar dados"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1 border-t border-line">
                        <button
                          onClick={() => handleToggleAtivoConvidado(conv)}
                          disabled={actionLoading === conv.id}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50 ${
                            conv.ativo
                              ? 'border border-line bg-paper hover:bg-clay-tint hover:text-clay text-muted'
                              : 'bg-forest hover:bg-forest-dark text-white'
                          }`}
                        >
                          {conv.ativo ? (
                            <>
                              <UserX className="w-3.5 h-3.5" /> Desativar Convidado
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" /> Reativar Convidado
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleRemoverConvidado(conv)}
                          disabled={actionLoading === conv.id}
                          className="py-1.5 px-3 rounded-lg border border-line bg-paper hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                          title="Remover permanentemente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* ABA 4: PONTOS EM REUNIÃO */}
          {/* ========================================================== */}
          {activeTab === 'pontos_reuniao' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-paper border border-line flex items-start gap-2.5 text-xs text-muted">
                <Gavel className="w-4 h-4 text-forest shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-ink">Deliberação da Reunião de Casa:</strong> Estes pontos expiraram o prazo de 24 horas sem que ninguém assumisse a culpa e sem acusados pendentes. O Admin delibera na reunião para anular o ponto ou atribuí-lo ao verdadeiro culpado (aplicando a regra das 2 penalidades totais).
                </p>
              </div>

              {pontosReuniao.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-mint text-forest flex items-center justify-center mx-auto mb-3">
                    <Check className="w-5 h-5" />
                  </div>
                  <h4 className="text-base font-semibold text-ink">Nenhum ponto em reunião</h4>
                  <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                    Não há ocorrências de bagunça aguardando deliberação de reunião no momento.
                  </p>
                </div>
              ) : (
                pontosReuniao.map((p) => {
                  const dataCriacao = new Date(p.created_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const nomeRelator = p.relator?.apelido || p.relator?.nome || 'Morador';

                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-xl border border-line bg-surface space-y-3.5 shadow-2xs"
                    >
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-ink">
                              {p.local_descricao}
                            </h4>
                            <Tag tone="alert">Reunião</Tag>
                          </div>
                          <p className="text-xs text-muted mt-0.5">
                            Denunciado por <strong>{nomeRelator}</strong> em {dataCriacao}
                          </p>
                        </div>
                      </div>

                      {/* Foto sem blur em destaque */}
                      <div className="w-full aspect-video rounded-xl overflow-hidden border border-line bg-paper">
                        <img
                          src={p.foto_url || '/logo.png'}
                          alt={p.local_descricao}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Informações de Defesas e Acusações */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-paper border border-line">
                          <span className="font-semibold text-ink block mb-1">
                            Declararam Inocência ({(p.inocentes || []).length}):
                          </span>
                          {(p.inocentes || []).length === 0 ? (
                            <span className="text-muted">Ninguém declarou inocência.</span>
                          ) : (
                            <span className="text-muted">
                              {(p.inocentes || [])
                                .map((m: any) => m.apelido || m.nome)
                                .join(', ')}
                            </span>
                          )}
                        </div>

                        <div className="p-2.5 rounded-lg bg-paper border border-line">
                          <span className="font-semibold text-ink block mb-1">
                            Histórico de Acusações ({(p.acusacoesFormatadas || []).length}):
                          </span>
                          {(p.acusacoesFormatadas || []).length === 0 ? (
                            <span className="text-muted">Nenhuma acusação formal registrada.</span>
                          ) : (
                            <span className="text-muted">
                              {(p.acusacoesFormatadas || [])
                                .map(
                                  (a: any) =>
                                    `${a.acusado?.apelido || a.acusado?.nome} (por ${
                                      a.acusador?.apelido || a.acusador?.nome
                                    }: ${a.status})`
                                )
                                .join('; ')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Discussão do Chat */}
                      {(p.mensagens || []).length > 0 && (
                        <div className="p-2.5 rounded-lg bg-paper border border-line text-xs">
                          <span className="font-semibold text-ink block mb-1.5 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5 text-muted" />
                            Discussão da Casa ({(p.mensagens || []).length}):
                          </span>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {(p.mensagens || []).map((m: any) => (
                              <div key={m.id} className="text-[11px] leading-snug">
                                <strong className="text-ink">
                                  {m.autor?.apelido || m.autor?.nome || 'Morador'}:
                                </strong>{' '}
                                <span className="text-muted">{m.conteudo}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Botões de Ação do Admin na Reunião */}
                      <div className="flex gap-2 pt-2 border-t border-line">
                        <button
                          onClick={() => {
                            setModalAtribuirPonto(p);
                            setCulpadoReuniaoId('');
                          }}
                          className="flex-1 py-2 px-3 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Gavel className="w-3.5 h-3.5" /> Atribuir Culpa (2 Penalidades)
                        </button>

                        <button
                          onClick={() => handleAnularPontoReuniao(p.id)}
                          disabled={actionLoading === p.id}
                          className="py-2 px-3 rounded-lg border border-line bg-paper hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Anular Ponto
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================== */}
      {/* MODAL: EDIÇÃO DE MORADOR ATIVO PELO ADMIN */}
      {/* ========================================================== */}
      {editingMorador && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Shield className="w-4 h-4 text-forest" />
                  Editar Morador
                </h3>
                <p className="text-xs text-muted mt-0.5">{editingMorador.email}</p>
              </div>
              <button
                onClick={() => setEditingMorador(null)}
                className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Foto de Perfil do Morador */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper">
              {editAvatarUrl ? (
                <img
                  src={editAvatarUrl}
                  alt={editApelido}
                  className="w-12 h-12 rounded-full object-cover border border-line shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-mint text-forest font-bold text-base flex items-center justify-center shrink-0">
                  {(editApelido || editNome || 'M').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ink">Foto de Perfil</p>
                <p className="text-[11px] text-muted truncate">
                  {editAvatarUrl ? 'Foto configurada' : 'Sem foto'}
                </p>
              </div>
              {editAvatarUrl && (
                <button
                  type="button"
                  onClick={() => setEditAvatarUrl(null)}
                  className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  title="Remover foto do morador"
                >
                  <Trash2 className="w-3 h-3" /> Remover
                </button>
              )}
            </div>

            <form onSubmit={handleSalvarEdicaoMorador} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                  Apelido na República <span className="text-clay">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editApelido}
                  onChange={(e) => setEditApelido(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm font-medium focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                  Nome Completo <span className="text-clay">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                    Geração <span className="text-clay">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editGeracao}
                    onChange={(e) => setEditGeracao(e.target.value)}
                    placeholder="025"
                    className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                    Cargo (Role)
                  </label>
                  <select
                    value={editRole}
                    disabled={editingMorador.id === user?.id}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest disabled:bg-paper disabled:text-muted"
                  >
                    <option value="morador">Morador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              {editingMorador.id === user?.id && (
                <p className="text-[11px] text-muted">
                  * Você é o Administrador logado e não pode rebaixar seu próprio cargo.
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                  Quarto Atual
                </label>
                <select
                  value={editQuartoId}
                  onChange={(e) => setEditQuartoId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                >
                  <option value="">Sem quarto vinculado</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={actionLoading === editingMorador.id}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {actionLoading === editingMorador.id ? 'Salvando...' : 'Salvar Dados'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMorador(null)}
                  className="py-2.5 px-3 rounded-lg border border-line bg-paper hover:bg-line text-ink text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>

            {/* Zona Administrativa Crítica: Desativação / Remoção */}
            <div className="pt-3 border-t border-line space-y-2">
              <h5 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                Zona de Acesso
              </h5>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDesativarMorador(editingMorador)}
                  disabled={editingMorador.id === user?.id || actionLoading === editingMorador.id}
                  className="flex-1 py-2 px-3 rounded-lg border border-line bg-paper hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Desativar Acesso
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoverMorador(editingMorador)}
                  disabled={editingMorador.id === user?.id || actionLoading === editingMorador.id}
                  className="py-2 px-3 rounded-lg border border-line bg-paper hover:border-clay hover:text-clay text-muted text-xs font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                  title="Excluir cadastro"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: EDIÇÃO DE CONVIDADO EXTERNO */}
      {/* ========================================================== */}
      {editingConvidado && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Phone className="w-4 h-4 text-forest" />
                  Editar Convidado
                </h3>
                <p className="text-xs text-muted mt-0.5">{editingConvidado.email}</p>
              </div>
              <button
                onClick={() => setEditingConvidado(null)}
                className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarEdicaoConvidado} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                  Apelido <span className="text-clay">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editConvApelido}
                  onChange={(e) => setEditConvApelido(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm font-medium focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={editConvNome}
                  onChange={(e) => setEditConvNome(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                  Telefone / WhatsApp <span className="text-clay">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editConvTelefone}
                  onChange={(e) => setEditConvTelefone(e.target.value)}
                  placeholder="(19) 99999-9999"
                  className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink text-sm font-mono focus:outline-none focus:border-forest"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={actionLoading === editingConvidado.id}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-forest hover:bg-forest-dark text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {actionLoading === editingConvidado.id ? 'Salvando...' : 'Salvar Convidado'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingConvidado(null)}
                  className="py-2.5 px-3 rounded-lg border border-line bg-paper hover:bg-line text-ink text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: ATRIBUIR PONTO EM REUNIÃO (REGRA DAS 2 PENALIDADES) */}
      {/* ========================================================== */}
      {modalAtribuirPonto && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-forest" />
                  Julgamento na Reunião
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {modalAtribuirPonto.local_descricao}
                </p>
              </div>
              <button
                onClick={() => {
                  setModalAtribuirPonto(null);
                  setCulpadoReuniaoId('');
                }}
                className="p-1.5 rounded-lg text-muted hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explicação da Regra das 2 Penalidades */}
            <div className="p-3 rounded-xl bg-cream/70 border border-line text-xs text-muted leading-relaxed space-y-1.5">
              <p className="font-semibold text-ink flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-forest" /> Regra das 2 Penalidades Totais:
              </p>
              <p>
                • <strong>Se mentiu</strong> (declarou inocência): não tomou o ponto de omissão em 24h. Na reunião, recebe o ponto e uma penalidade duplicada (Total: 2 pontos).
              </p>
              <p>
                • <strong>Se foi omisso</strong> (não interagiu em 24h): já tomou 1 ponto por omissão. Na reunião, recebe apenas o ponto da infração (Total: 1 omissão + 1 infração = 2 pontos).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                Quem foi o culpado deliberado na reunião? <span className="text-clay font-bold">*</span>
              </label>
              <select
                value={culpadoReuniaoId}
                onChange={(e) => setCulpadoReuniaoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
              >
                <option value="">Selecione o morador...</option>
                {moradores.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.apelido || m.nome} ({m.nome})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2 border-t border-line">
              <button
                onClick={handleAtribuirPontoReuniao}
                disabled={!culpadoReuniaoId || atribuindoReuniao}
                className="flex-1 py-2.5 px-4 rounded-xl bg-forest hover:bg-forest-dark text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {atribuindoReuniao ? 'Gravando decisão...' : 'Confirmar Culpa (2 Penalidades)'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAtribuirPonto(null);
                  setCulpadoReuniaoId('');
                }}
                className="py-2.5 px-4 rounded-xl border border-line bg-paper hover:bg-line text-muted text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
