import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import type { Room } from '../../types/auth';
import { Button } from '../../components/ui';

// Quartos padrão oficiais da Canta Grillo (conforme banco de dados)
const QUARTOS_PADRAO = [
  'Carandiru',
  'High School',
  'Principal',
  'Quádruplo',
  'Triplo',
  'Varanda',
];

export const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');

  // Formulário
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [geracao, setGeracao] = useState('');
  const [quartoNome, setQuartoNome] = useState('QUARTOS_PADRAO[1]');

  // Lista de quartos do banco
  const [rooms, setRooms] = useState<Room[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Busca quartos cadastrados no banco
  useEffect(() => {
    supabase
      .from('rooms')
      .select('*')
      .order('nome')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setRooms(data);
          setQuartoNome(data[0].nome);
        }
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagemErro(null);
    setMensagemSucesso(null);
    setSubmitting(true);

    try {
      if (modo === 'login') {
        if (!email.trim() || !password.trim()) {
          setMensagemErro('Preencha seu e-mail e senha.');
          setSubmitting(false);
          return;
        }

        const { error } = await signIn(email.trim(), password);
        if (error) {
          console.error('[AuthScreen] Erro no login:', error);
          if (error.message.includes('Invalid login credentials')) {
            setMensagemErro('E-mail ou senha incorretos.');
          } else if (error.message.includes('Email not confirmed')) {
            setMensagemErro(
              'Confirmação de e-mail pendente! No Supabase Dashboard, desative "Confirm email" (Authentication -> Providers -> Email) para permitir login imediato em desenvolvimento, ou confirme o link no seu e-mail.'
            );
          } else {
            setMensagemErro(`Erro ao entrar: ${error.message}`);
          }
        }
      } else {
        // Cadastro
        if (!nome.trim()) {
          setMensagemErro('Informe seu nome completo.');
          setSubmitting(false);
          return;
        }
        if (!email.trim() || password.length < 6) {
          setMensagemErro('A senha deve ter pelo menos 6 caracteres.');
          setSubmitting(false);
          return;
        }

        // Tenta achar o ID do quarto ou passar nulo
        const quartoId = rooms.find((r) => r.nome === quartoNome)?.id;

        const { error } = await signUp({
          email: email.trim(),
          password,
          nome: nome.trim(),
          apelido: apelido.trim() || undefined,
          geracao: geracao.trim() || '025',
          quarto_id: quartoId,
          role: 'morador',
        });

        if (error) {
          console.error('[AuthScreen] Erro no cadastro:', error);
          if (error.message.includes('already registered')) {
            setMensagemErro('Este e-mail já está cadastrado. Tente entrar na aba "Entrar".');
          } else if (error.message.includes('Database error saving new user')) {
            setMensagemErro(
              'Erro ao salvar usuário no banco de dados (Trigger PostgreSQL). Execute o script atualizado do handle_new_user() no SQL Editor do Supabase.'
            );
          } else {
            setMensagemErro(`Erro no cadastro: ${error.message}`);
          }
        } else {
          setMensagemSucesso(
            'Solicitação de cadastro enviada! Por segurança da república, um Administrador precisa aprovar o seu perfil antes de você poder entrar no app.'
          );
          setModo('login');
          setPassword('');
        }
      }
    } catch (err: any) {
      setMensagemErro(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col justify-center px-6 py-10">
      <div className="w-full max-w-sm mx-auto">
        {/* Identificação da República */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full overflow-hidden border border-line bg-surface mx-auto mb-3">
            <img
              src="/logo.png"
              alt="Logo Canta Grillo"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Canta Grillo
          </h1>
          <p className="text-xs text-muted mt-0.5">
            República Universitária · Desde 2004
          </p>
        </div>

        {/* Abas: Entrar vs Cadastrar */}
        <div className="grid grid-cols-2 p-1 rounded-lg bg-surface border border-line mb-6">
          <button
            type="button"
            onClick={() => {
              setModo('login');
              setMensagemErro(null);
              setMensagemSucesso(null);
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors ${
              modo === 'login'
                ? 'bg-paper text-ink font-semibold shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('cadastro');
              setMensagemErro(null);
              setMensagemSucesso(null);
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors ${
              modo === 'cadastro'
                ? 'bg-paper text-ink font-semibold shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Novo Morador
          </button>
        </div>

        {/* Mensagens de feedback */}
        {mensagemErro && (
          <div className="mb-4 p-3 rounded-lg bg-clay-tint border border-line text-clay text-xs leading-relaxed">
            {mensagemErro}
          </div>
        )}

        {mensagemSucesso && (
          <div className="mb-4 p-3 rounded-lg bg-mint border border-line text-forest text-xs leading-relaxed">
            {mensagemSucesso}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {modo === 'cadastro' && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Nome completo
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
    
                  className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Apelido na rep
                  </label>
                  <input
                    type="text"
                    value={apelido}
                    onChange={(e) => setApelido(e.target.value)}
                  
                    className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Geração
                  </label>
                  <input
                    type="text"
                    value={geracao}
                    onChange={(e) => setGeracao(e.target.value)}
                    placeholder="Ex: 025"
                    className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Seu quarto
                </label>
                <select
                  value={quartoNome}
                  onChange={(e) => setQuartoNome(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:border-forest"
                >
                  {(rooms.length > 0 ? rooms.map((r) => r.nome) : QUARTOS_PADRAO).map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@exemplo.com"
              className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Senha {modo === 'cadastro' && <span className="text-muted">(mín. 6 dígitos)</span>}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:outline-none focus:border-forest"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" full disabled={submitting}>
              {submitting
                ? modo === 'login'
                  ? 'Entrando...'
                  : 'Criando conta...'
                : modo === 'login'
                ? 'Entrar na casa'
                : 'Cadastrar morador'}
            </Button>
          </div>
        </form>

        <p className="text-[11px] text-muted text-center mt-6">
          Acesso restrito aos moradores e agregados da República Canta Grillo.
        </p>
      </div>
    </div>
  );
};
