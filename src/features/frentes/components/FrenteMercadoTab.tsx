import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import type {
  MarketCatalogItem,
  SolicitacaoMercado,
  ItemCompraAgrupado,
  CategoriaMercado,
} from '../../../types/frentes';
import {
  agruparSolicitacoesMercadoPorItem,
  obterMesAnoAtual,
} from '../../../types/frentes';
import { Tag, Button } from '../../../components/ui';
import {
  ShoppingCart,
  PlusCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
} from 'lucide-react';

interface FrenteMercadoTabProps {
  isAdmin?: boolean;
  isMembroDaFrente?: boolean;
  compactSolicitar?: boolean;
  onSuccess?: () => void;
}

const CATEGORIAS: CategoriaMercado[] = [
  'Alimentos',
  'Limpeza',
  'Higiene',
  'Descartáveis',
  'Outros',
];

export const FrenteMercadoTab: React.FC<FrenteMercadoTabProps> = ({
  isAdmin = false,
  isMembroDaFrente = false,
  compactSolicitar = false,
  onSuccess,
}) => {
  const { user } = useAuth();
  const podeGerenciar = Boolean(isAdmin || isMembroDaFrente);

  const [subAba, setSubAba] = useState<'compras' | 'catalogo'>('compras');
  const [mesAnoCiclo, setMesAnoCiclo] = useState(() => obterMesAnoAtual());

  const [catalogo, setCatalogo] = useState<MarketCatalogItem[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoMercado[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de Solicitar Item
  const [modalSolicitar, setModalSolicitar] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [salvando, setSalvando] = useState(false);

  // Formulário de Novo Item no Catálogo
  const [modalNovoItem, setModalNovoItem] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCategoria, setNovaCategoria] = useState<CategoriaMercado>('Alimentos');
  const [novaUnidade, setNovaUnidade] = useState('unidade');

  const carregarDados = useCallback(async () => {
    try {
      // 1. Busca catálogo mestre
      const { data: catData } = await supabase
        .from('market_catalog')
        .select('*')
        .order('nome');

      if (catData) {
        setCatalogo(catData as MarketCatalogItem[]);
      }

      // 2. Busca solicitações do ciclo
      const { data: solData } = await supabase
        .from('solicitacoes_mercado')
        .select(`
          item_id,
          mes_ano_ciclo,
          solicitado_por,
          status,
          data_solicitacao,
          item:market_catalog(*),
          solicitante:profiles(id, nome, apelido)
        `)
        .eq('mes_ano_ciclo', mesAnoCiclo);

      if (solData) {
        setSolicitacoes(solData as unknown as SolicitacaoMercado[]);
      }
    } catch (err) {
      console.error('[FrenteMercadoTab] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [mesAnoCiclo]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('mercado-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_mercado' },
        () => carregarDados()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_catalog' },
        () => carregarDados()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarDados]);

  const itensAgrupados = agruparSolicitacoesMercadoPorItem(solicitacoes, catalogo);
  const itensPendentes = itensAgrupados.filter((i) => !i.todosComprados);
  const itensComprados = itensAgrupados.filter((i) => i.todosComprados);

  // Navegação de mês
  const navegarMes = (delta: number) => {
    const [ano, mes] = mesAnoCiclo.split('-').map(Number);
    const novaData = new Date(ano, mes - 1 + delta, 1);
    setMesAnoCiclo(obterMesAnoAtual(novaData));
  };

  const formatarMesAno = (ciclo: string) => {
    const [ano, mes] = ciclo.split('-').map(Number);
    const data = new Date(ano, mes - 1, 1);
    const mesNome = data.toLocaleDateString('pt-BR', { month: 'long' });
    return `${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} de ${ano}`;
  };

  // Solicitar Item
  const handleSolicitarItem = async (itemId: string) => {
    if (!user?.id || !itemId) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from('solicitacoes_mercado').insert({
        item_id: itemId,
        mes_ano_ciclo: mesAnoCiclo,
        solicitado_por: user.id,
        status: 'solicitado',
      });

      if (error) {
        if (error.code === '23505') {
          alert('Você já solicitou este item neste mês!');
        } else {
          alert('Erro ao solicitar item: ' + error.message);
        }
      } else {
        setModalSolicitar(false);
        await carregarDados();
        onSuccess?.();
      }
    } finally {
      setSalvando(false);
    }
  };

  // Toggle Comprado (Exclusivo membros frente / admin)
  const handleToggleComprado = async (itemAgrupado: ItemCompraAgrupado) => {
    if (!podeGerenciar) return;
    const novoStatus = itemAgrupado.todosComprados ? 'solicitado' : 'comprado';
    setSalvando(true);

    try {
      const { error } = await supabase
        .from('solicitacoes_mercado')
        .update({ status: novoStatus })
        .match({ item_id: itemAgrupado.item.id, mes_ano_ciclo: mesAnoCiclo });

      if (error) {
        alert('Erro ao atualizar status: ' + error.message);
      } else {
        await carregarDados();
      }
    } finally {
      setSalvando(false);
    }
  };

  // Criar novo item no catálogo mestre
  const handleCriarItemCatalogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeGerenciar || !novoNome.trim()) return;

    setSalvando(true);
    try {
      const { error } = await supabase.from('market_catalog').insert({
        nome: novoNome.trim(),
        categoria: novaCategoria,
        unidade_medida: novaUnidade.trim(),
        is_ativo: true,
      });

      if (error) {
        alert('Erro ao cadastrar produto: ' + error.message);
      } else {
        setModalNovoItem(false);
        setNovoNome('');
        setNovaUnidade('unidade');
        await carregarDados();
      }
    } finally {
      setSalvando(false);
    }
  };

  // Alternar ativo/inativo item catálogo
  const handleToggleAtivoItem = async (item: MarketCatalogItem) => {
    if (!podeGerenciar) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('market_catalog')
        .update({ is_ativo: !item.is_ativo })
        .eq('id', item.id);

      if (error) {
        alert('Erro ao alterar item: ' + error.message);
      } else {
        await carregarDados();
      }
    } finally {
      setSalvando(false);
    }
  };

  // Filtro de catálogo para solicitação
  const itensCatalogoFiltrados = catalogo.filter((item) => {
    if (!item.is_ativo) return false;
    const matchBusca = item.nome.toLowerCase().includes(buscaItem.toLowerCase());
    const matchCat = categoriaFiltro === 'todas' || item.categoria === categoriaFiltro;
    return matchBusca && matchCat;
  });

  // Modo Compacto (Atalho "Pedir Item de Mercado" do topo de FrentesScreen)
  if (compactSolicitar) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Pedir Item para o Mercado</h3>
          <p className="text-xs text-muted">
            Selecione do catálogo oficial o que está em falta na república ({formatarMesAno(mesAnoCiclo)})
          </p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
            <input
              type="text"
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              placeholder="Buscar item (ex: arroz, esponja)..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-line bg-paper text-ink focus:outline-none focus:border-forest"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
            <button
              type="button"
              onClick={() => setCategoriaFiltro('todas')}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                categoriaFiltro === 'todas'
                  ? 'bg-forest text-white font-semibold'
                  : 'bg-surface border border-line text-muted'
              }`}
            >
              Todas
            </button>
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaFiltro(cat)}
                className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                  categoriaFiltro === cat
                    ? 'bg-forest text-white font-semibold'
                    : 'bg-surface border border-line text-muted'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-line/60 border-y border-line py-1">
          {itensCatalogoFiltrados.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">Nenhum produto encontrado.</p>
          ) : (
            itensCatalogoFiltrados.map((item) => {
              const jaSolicitado = solicitacoes.some(
                (s) => s.item_id === item.id && s.solicitado_por === user?.id
              );
              return (
                <div
                  key={item.id}
                  className="py-2 px-1 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-xs font-medium text-ink">{item.nome}</p>
                    <p className="text-[10px] text-muted">
                      {item.categoria} · {item.unidade_medida}
                    </p>
                  </div>
                  <Button
                    variant={jaSolicitado ? 'outline' : 'primary'}
                    onClick={() => handleSolicitarItem(item.id)}
                    disabled={salvando || jaSolicitado}
                  >
                    <span className="text-xs">
                      {jaSolicitado ? 'Já pedido ✓' : 'Pedir'}
                    </span>
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Seletor de Ciclo Mensal */}
      <div className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between">
        <button
          type="button"
          onClick={() => navegarMes(-1)}
          className="p-1 text-muted hover:text-ink rounded transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-xs font-bold text-ink tracking-tight">
            {formatarMesAno(mesAnoCiclo)}
          </p>
          <p className="text-[10px] text-muted">
            {itensPendentes.length} itens a comprar · {itensComprados.length} comprados
          </p>
        </div>
        <button
          type="button"
          onClick={() => navegarMes(1)}
          className="p-1 text-muted hover:text-ink rounded transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Sub-abas para membros da Frente Mercado / Admin */}
      {podeGerenciar && (
        <div className="flex border-b border-line gap-2">
          <button
            type="button"
            onClick={() => setSubAba('compras')}
            className={`pb-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
              subAba === 'compras'
                ? 'border-forest text-forest'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Lista de Compras & Pedidos
          </button>
          <button
            type="button"
            onClick={() => setSubAba('catalogo')}
            className={`pb-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
              subAba === 'catalogo'
                ? 'border-forest text-forest'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Catálogo Mestre
          </button>
        </div>
      )}

      {/* ABA 1: LISTA DE COMPRAS */}
      {subAba === 'compras' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Checklist de Compras do Mês
            </h4>
            <Button variant="outline" onClick={() => setModalSolicitar(true)}>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <PlusCircle className="w-3.5 h-3.5 text-forest" />
                Pedir Item
              </span>
            </Button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-muted">Carregando lista de compras...</div>
          ) : itensAgrupados.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-line rounded-xl bg-surface/50 space-y-1">
              <ShoppingCart className="w-7 h-7 text-muted mx-auto mb-2" />
              <p className="text-sm font-medium text-ink">Nenhum item solicitado neste ciclo!</p>
              <p className="text-xs text-muted">Toque em "Pedir Item" para solicitar suprimentos da casa.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Itens Pendentes */}
              {itensPendentes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-clay uppercase tracking-wider block">
                    Pendentes de Compra ({itensPendentes.length})
                  </span>
                  <div className="space-y-2">
                    {itensPendentes.map((agrupado) => (
                      <div
                        key={agrupado.item.id}
                        className="p-3 rounded-xl border border-line bg-surface flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink truncate">
                            {agrupado.item.nome}
                          </p>
                          <p className="text-[11px] text-muted">
                            {agrupado.item.categoria} · {agrupado.item.unidade_medida}
                          </p>
                          <p className="text-[10px] text-muted/80 mt-0.5">
                            Pedido por:{' '}
                            <span className="font-medium text-ink">
                              {agrupado.solicitantesApelidos.join(', ')}
                            </span>
                          </p>
                        </div>

                        {podeGerenciar ? (
                          <button
                            type="button"
                            onClick={() => handleToggleComprado(agrupado)}
                            disabled={salvando}
                            className="px-3 py-1.5 rounded-lg border border-line hover:border-forest text-xs font-semibold text-forest hover:bg-mint transition-colors flex items-center gap-1.5 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Comprar
                          </button>
                        ) : (
                          <Tag tone="alert">Pendente</Tag>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Itens Já Comprados */}
              {itensComprados.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-line">
                  <span className="text-[11px] font-semibold text-forest uppercase tracking-wider block">
                    Já Comprados ({itensComprados.length})
                  </span>
                  <div className="space-y-2">
                    {itensComprados.map((agrupado) => (
                      <div
                        key={agrupado.item.id}
                        className="p-3 rounded-xl border border-line bg-paper/60 opacity-85 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink line-through truncate">
                            {agrupado.item.nome}
                          </p>
                          <p className="text-[10px] text-muted">
                            {agrupado.solicitantesApelidos.join(', ')}
                          </p>
                        </div>

                        {podeGerenciar ? (
                          <button
                            type="button"
                            onClick={() => handleToggleComprado(agrupado)}
                            disabled={salvando}
                            className="text-[11px] text-muted hover:text-clay"
                          >
                            Desmarcar
                          </button>
                        ) : (
                          <Tag tone="green">Comprado ✓</Tag>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA 2: CATÁLOGO MESTRE */}
      {subAba === 'catalogo' && podeGerenciar && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-ink">Catálogo Mestre de Produtos</h4>
              <p className="text-[11px] text-muted">Gerencie a lista oficial de compras da república</p>
            </div>
            <Button variant="outline" onClick={() => setModalNovoItem(true)}>
              <span className="flex items-center gap-1 text-xs font-semibold">
                <PlusCircle className="w-3.5 h-3.5 text-forest" />
                Novo Produto
              </span>
            </Button>
          </div>

          <div className="divide-y divide-line border-y border-line text-xs">
            {catalogo.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className={`font-semibold ${item.is_ativo ? 'text-ink' : 'text-muted line-through'}`}>
                    {item.nome}
                  </p>
                  <p className="text-[10px] text-muted">
                    {item.categoria} · {item.unidade_medida}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAtivoItem(item)}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                    item.is_ativo
                      ? 'text-forest bg-mint'
                      : 'text-muted bg-line'
                  }`}
                >
                  {item.is_ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Pedir Item (dentro da tela da frente) */}
      {modalSolicitar && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h3 className="text-base font-semibold text-ink">Pedir Item de Mercado</h3>
              <button
                type="button"
                onClick={() => setModalSolicitar(false)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
              <input
                type="text"
                value={buscaItem}
                onChange={(e) => setBuscaItem(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-line/60 border-y border-line py-1">
              {itensCatalogoFiltrados.map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-ink">{item.nome}</p>
                    <p className="text-[10px] text-muted">{item.categoria}</p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => handleSolicitarItem(item.id)}
                    disabled={salvando}
                  >
                    <span className="text-xs">Pedir</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Novo Produto no Catálogo */}
      {modalNovoItem && podeGerenciar && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-paper border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h3 className="text-base font-semibold text-ink">Adicionar ao Catálogo</h3>
              <button
                type="button"
                onClick={() => setModalNovoItem(false)}
                className="text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCriarItemCatalogo} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Nome do produto *</label>
                <input
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Arroz Parboilizado 5kg"
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Categoria *</label>
                <select
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value as CategoriaMercado)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Unidade de medida</label>
                <input
                  type="text"
                  value={novaUnidade}
                  onChange={(e) => setNovaUnidade(e.target.value)}
                  placeholder="Ex: pacote, caixa, garrafa"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-line bg-surface text-ink focus:outline-none focus:border-forest"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  full
                  onClick={() => setModalNovoItem(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" full disabled={salvando || !novoNome.trim()}>
                  {salvando ? 'Salvando...' : 'Salvar Produto'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
