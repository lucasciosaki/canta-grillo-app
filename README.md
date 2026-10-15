# 🦗 República Canta Grillo — App PWA

> **Aplicativo Mobile-first Progressive Web App (PWA) para gestão diária, organização e convivência da República Canta Grillo (São Carlos - SP).**  
> Fundada em 2004, a casa abriga cerca de 21 moradores e agregados universitários.

---

## 📱 Visão Geral

O **Canta Grillo App** foi projetado para substituir planilhas e murais físicos por uma experiência digital fluida, rápida e elegante no celular. O aplicativo adota a estética visual **Warm Paper** (tons quentes de papel, tipografia limpa e sem sombras pesadas) e foi construído com arquitetura **Database-First**, garantindo segurança rigorosa por meio de políticas de **Row Level Security (RLS)** no PostgreSQL (Supabase).

---

## 🚀 Principais Módulos e Funcionalidades

### 1. 🍲 Folha de Misturas Digital (Refeições)
* **Marcação de Cotas:** Controle individual de misturas diárias para Almoço e Jantar com três estados intuitivos:
  * `—` : Vazio / Sem consumo ($0.0$)
  * `1/2` : Meia mistura consumida ($0.5$)
  * `X` : Duas misturas consumidas ($1.0$)
* **Sincronização em Tempo Real:** Atualizações instantâneas entre todos os moradores via Supabase Realtime.
* **Membros Externos & Convidados:** Registro de refeições de agregados para fechamento mensal da Frente Financeiro ("Caixinha").

### 2. 🏛️ Frentes Organizacionais (10 Setores da Casa)
* Painel completo com as 10 frentes oficiais da república:
  1. **Financeiro (Caixinha)**
  2. **Manutenção**
  3. **Piscina**
  4. **Jardim**
  5. **Mercado**
  6. **Dogs**
  7. **PP (Marketing)**
  8. **Valéria (Proprietária)**
  9. **Hanna (Vizinha)**
  10. **Varanda**
* **Gestão de Lideranças:** Suporte a múltiplos líderes por frente (co-liderança) com nomeação e remoção exclusivas do Administrador.
* **Chat Integrado:** Canal de comunicação interno por frente para recados e avisos rápidos.

### 3. 🧹 Limpeza & Faxina dos Quartos
* **Escala Semanal:** Quadro dinâmico cruzando os quartos da casa com as áreas comuns:
  * *Quartos Oficiais:* **Carandiru**, **High School**, **Principal**, **Quádruplo**, **Triplo** e **Varanda**.
* **Comprovação Diária por Fotos:** Envio de fotos da área limpa com compressão client-side no celular.
* **Painel de Penalidades:** Notificação e registro de penalidades para quartos com faltas na semana.

### 4. 🍺 Caixas de Cerveja & Ocorrências de Desorganização
* **Módulo de Pontos Individuais:** Qualquer morador pode relatar itens esquecidos ou bagunça anexando foto.
* **Assunção de Culpa:** O culpado assume a ocorrência pelo app, registrando o ponto em seu histórico.
* **Gatilho Automático de Breja:** Acúmulo de **7 pontos no mês = 1 caixa de cerveja** gerada automaticamente por Trigger no PostgreSQL.
* **Registro Unitário de Caixas:** Histórico de caixas pendentes e pagas (vindas de pontos ou motivos tradicionais: namoro, estágio, etc.).

### 5. 🐶 Frente Dogs
* **Controle de 2 Refeições Diárias:** Registro de quem alimentou os cães da casa no turno da manhã e da noite, com horário e observações.
* **Reset Diário Automático:** O status diário reinicia à meia-noite para acompanhamento constante.

### 6. 🛒 Frente Mercado
* **Catálogo Mestre:** Itens padronizados com categorias e unidades de medida.
* **Solicitações Mensais:** Moradores solicitam produtos para o ciclo mensal de compras.

### 7. 📄 Atas de Reunião & Pasta do Drive
* **Ata da Última Reunião:** Qualquer morador ativo pode publicar o link da ata mais recente (ex.: Google Docs). O app exibe dinamicamente a ata de maior data na tela inicial.
* **Drive da República:** Botão de acesso direto à pasta compartilhada da casa, protegido no banco via `house_settings`.

### 8. 🛡️ Autenticação & Aprovações (Database-First RLS)
* **Aprovação Obrigatória:** Todo novo cadastro nasce com status `ativo = false` e permissão `morador`.
* **Sala de Espera ("Cadastro em Análise"):** Novos moradores aguardam aprovação de um Administrador para ter acesso liberado à casa.
* **Segurança no Banco:** Inserções diretas na tabela `profiles` são bloqueadas via API. Apenas o gatilho interno `handle_new_user()` (`SECURITY DEFINER`) cria o perfil seguro no servidor.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Frontend** | React 19 + TypeScript | UI reativa com tipagem estrita |
| **Build Tool** | Vite 8 | Servidor de alta performance e HMR instantâneo |
| **Estilização** | Tailwind CSS v4 | CSS utility-first com tema personalizado Warm Paper |
| **Ícones** | Lucide React | Conjunto moderno e consistente de ícones |
| **Tipografia** | `@fontsource-variable/dm-sans` | Fonte *DM Sans Variable* de alta legibilidade |
| **PWA** | `vite-plugin-pwa` | Suporte a Service Worker, cache offline e instalação como app nativo |
| **Backend & BaaS** | Supabase | PostgreSQL gerenciado, Auth, Row Level Security e Realtime |

---

## 🎨 Identidade Visual (Warm Paper)

A paleta de cores foi desenvolvida para transmitir acolhimento e clareza, evitando o visual impessoal de dashboards tradicionais:

* **Fundo Paper (`#f6f5ef`):** Tom de papel aquecido, suave aos olhos.
* **Superfície (`#fffefa`):** Cartões e modais destacados sem necessidade de sombras pesadas.
* **Tinta / Ink (`#16241b`):** Verde-escuro quase preto para textos e títulos.
* **Verde Floresta (`#0a6b24`):** Ações primárias e aprovações.
* **Terracota / Alerta (`#b4532f`):** Ocorrências, pendências e alertas de pontos.

---

## 📂 Estrutura de Diretórios

```
canta-grillo-app/
├── public/                 # Manifest, favicon, ícones PWA e splash screens
├── src/
│   ├── assets/             # Imagens estáticas e recursos visuais
│   ├── components/         # Componentes compartilhados
│   │   ├── auth/           # Route Guard, LoadingScreen, PendingApprovalScreen
│   │   └── ui.tsx          # PageTitle, Section, Row, Tag, Button
│   ├── contexts/           # AuthContext (sessão, perfil e permissões)
│   ├── features/           # Módulos funcionais da aplicação
│   │   ├── admin/          # Aprovações de moradores
│   │   ├── auth/           # Tela de Login e Cadastro de Moradores
│   │   ├── frentes/        # Gestão das 10 frentes e líderes
│   │   ├── limpeza/        # Escala e comprovações de faxina
│   │   └── refeicoes/      # Folha de misturas diárias
│   ├── hooks/              # Custom React hooks (useHouseLinks, etc.)
│   ├── lib/                # Inicialização do Supabase Client
│   ├── types/              # Definições TypeScript (auth, frentes, etc.)
│   ├── App.tsx             # Navegação principal (3 abas: Início, Casa, Perfil)
│   ├── index.css           # Configuração de temas Tailwind CSS v4
│   └── main.tsx            # Ponto de entrada da aplicação
├── supabase/
│   └── schema.sql          # Schema DDL completo, Triggers e Políticas RLS
├── .env.example            # Modelo de variáveis de ambiente
├── .gitignore              # Arquivos e binários ignorados pelo Git
├── AGY.md                  # Especificação arquitetural formal (MER-X)
├── REQUIREMENTS.md         # Documento oficial de Requisitos e Regras de Negócio
└── vite.config.ts          # Configuração do Vite e plugin PWA
```

---

## 💻 Como Rodar o Projeto Localmente

### 1. Pré-requisitos
* [Node.js](https://nodejs.org/) versão 18 ou superior.
* Gerenciador de pacotes `npm`.
* Projeto criado no [Supabase](https://supabase.com).

### 2. Instalação
Clone o repositório e instale as dependências:

```bash
git clone https://github.com/seu-usuario/canta-grillo-app.git
cd canta-grillo-app
npm install
```

### 3. Configuração do Supabase (.env)
Copie o arquivo de exemplo e preencha com as chaves do seu projeto:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon-aqui
```

### 4. Execução do Banco de Dados
1. Abra o painel do seu projeto no **Supabase Dashboard**.
2. Vá em **SQL Editor** e execute o script contido em [`supabase/schema.sql`](./supabase/schema.sql).
3. No menu **Authentication ➔ Providers ➔ Email**, desative a opção **"Confirm email"** para permitir que moradores cadastrados possam logar imediatamente durante o desenvolvimento.

### 5. Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
O app estará acessível em `http://localhost:5173` (ou porta alternativa indicada no terminal).

### 6. Build para Produção
Para validar a compilação TypeScript e gerar os arquivos otimizados do PWA em `/dist`:
```bash
npm run build
```

---

## 📄 Licença e Uso

Desenvolvido exclusivamente para a **República Canta Grillo** — São Carlos, SP.  
Todos os direitos reservados à comunidade da República Canta Grillo.
