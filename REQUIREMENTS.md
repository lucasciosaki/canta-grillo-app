# Documento de Requisitos de Software (SRS) - Canta Grillo PWA

> **Status:** Consolidado e Pronto para Desenvolvimento  
> **Última Atualização:** 14/10/2026  
> **Versão:** 0.1.0  

---

## 1. Visão Geral do Produto
O aplicativo da **República Canta Grillo** é uma aplicação web progressiva (PWA) projetada para centralizar, automatizar e facilitar a rotina dos moradores em um único ambiente acessível tanto em dispositivos Android quanto iOS.

### 1.1 Objetivos
- Centralizar a organização diária da república (tarefas, finanças, compras e avisos).
- Garantir experiência nativa e acessibilidade multiplataforma via PWA.
- Facilitar a transparência e a colaboração no convívio comunitário.

---

## 2. Público-Alvo e Estrutura de Usuários

### 2.1 Capacidade e Volume de Usuários
- **Moradores Ativos:** Média de 20 a 21 moradores simultâneos.
- **Membros Externos / Agregados:** Amigos, ex-moradores e convidados com acesso restrito a módulos específicos (ex.: lista de almoço diário).

### 2.2 Sistema de Hierarquia e Gerações
- Todo morador está associado a uma **Geração** correspondente ao ano/período de ingresso na casa (Exemplo: `024`, `025`, `026`).
- **Hierarquia:** A antiguidade na república define a relação de veterania (Ex: `024` é veterana de `025` e `026`). O sistema deve registrar e exibir a geração no perfil do usuário, servindo de base para possíveis regras de prioridade ou visualização.

### 2.3 Frentes Organizacionais (Cargos Dinâmicos)
Os moradores podem assumir uma ou mais frentes de responsabilidade pela administração da casa. As atribuições e permissões de acesso a recursos específicos devem ser dinâmicas e configuráveis (passíveis de rotação anual):
1. **Financeiro ("Caixinha"):** Gestão do fluxo financeiro, rateio de contas, despesas e cobrança dos moradores.
2. **Manutenção:** Gestão de reparos prediais, chamados e conservação estrutural da casa.
3. **Piscina:** Acompanhamento de tratamento químico, limpeza e manutenção da área da piscina.
4. **Jardim:** Cuidados com a área verde, poda e rega.
5. **Mercado:** Levantamento de necessidades de compras coletivas e despensa.
6. **Dogs:** Gestão de cuidados, alimentação, vacinas e necessidades dos cachorros da república.
7. **PP (Propaganda & Marketing):** Gestão de redes sociais, divulgação de eventos e identidade da casa.
8. **Valéria:** Ponto de contato oficial e comunicação com a proprietária do imóvel.
9. **Hanna:** Ponto de contato oficial e comunicação de boa vizinhança.
10. **Varanda:** Cuidados e organização da área social da varanda.

### 2.4 Perfis de Acesso (RBAC - Role Based Access Control)
- **Superadmin / Conta Oficial da República:** Gestão global, aprovação e criação de moradores, atribuição de frentes e geração.
- **Morador (com Frentes Atribuídas):** Acesso a todas as áreas comuns (tarefas, almoço, avisos) + ferramentas de gestão da(s) sua(s) frente(s).
- **Membro Externo / Convidado:** Acesso restrito via link de convite autônomo (ex.: confirmação de presença na lista de almoço diário).

---

## 3. Módulos e Escopo Funcional

### 3.1 Módulo de Refeições e Controle de Misturas (Almoço / Janta)
Digitalização e substituição do controle físico em papel ("folha de misturas"):
- **Cota Diária do Morador:** Cada morador tem direito a exatamente **2 misturas por dia**.
- **Controle de Marcação Rápida:**
  - `Vazio / 0`: Nenhuma mistura consumida ainda no dia.
  - `1/2`: Morador consumiu 1 mistura (geralmente no almoço).
  - `X`: Morador consumiu as 2 misturas (completou a cota diária, ex.: almoço + janta).
- **Controle para Membros Externos / Convidados:**
  - Lista separada de controle de misturas/refeições para não-moradores.
  - Podem acessar via link ou serem registrados na lista por um morador.
  - Consolidação mensal de quantas refeições/misturas cada membro externo consumiu.
- **Preparação das Refeições:**
  - A casa conta com funcionária/cozinheira dedicada; o app **não** precisa gerenciar escalas de quem cozinha.
- **Ciclo Diário:**
  - As marcações resetam diariamente à meia-noite (com histórico arquivado para auditoria).

### 3.2 Gestão de Limpeza, Pontos e Organização da Casa

#### 3.2.1 Sistema de Pontos Individuais (Desorganização)
- **Abertura de Ocorrência com Foto Obrigatória:** Ao encontrar um item ou área desorganizada (ex.: copo na pia/sala, prato jogado, lixo fora do lugar), qualquer morador tira uma foto e abre uma ocorrência no app com o registro visual da infração.
- **Thread / Chat de Discussão por Ocorrência:** Cada requisição de ponto aberta possui um chat dedicado onde os moradores podem debater, identificar o autor e esclarecer o ocorrido.
- **Assunção de Culpa ("Assumir o Ponto"):** O morador culpado clica no botão para assumir a infração diretamente no app. O ponto é então creditado automaticamente em seu perfil individual.
- **Acúmulo Mensal e Gatilho:** Ao atingir a marca de **7 pontos acumulados no mês civil**, o sistema cria automaticamente uma obrigação de **1 caixa de cerveja individual** devida à república.
- **Histórico e Reset:** Os pontos individuais são zerados no início de cada mês, mantendo-se o histórico arquivado.

#### 3.2.2 Quadro de Pontos por Quartos (Times de Faxina Diária)
- **Agrupamento por Quartos:** Os moradores são organizados em times com base nos quartos onde dormem.
- **Escala Semanal:** Toda semana uma área comum da casa é atribuída a um quarto/time específico para arrumação diária.
- **Comprovação com Fotos (Upload Obrigatório):** Para dar baixa na tarefa diária, o quarto responsável deve anexar fotos comprovando a organização da área.
- **Sincronização com o Quadro Físico:** O app atualiza automaticamente a marcação após o envio das fotos, facilitando o espelhamento manual posterior no quadro físico da casa.
- **Faltas e Penalidades por Quarto:**
  - Caso um quarto acumule **2 ou mais pontos na semana** (ou seja, deixe de cumprir a tarefa diária 2 vezes ou mais), o sistema aplica uma penalidade.
  - **Penalidades Configuráveis:** O administrador do app deve ter autonomia para cadastrar e alterar o tipo de penalidade do quarto (pois variam ao longo do ano).


### 3.3 Gestão Financeira ("Caixinha")
- **Modelo de Mensalidade Fixa:**
  - Cada morador paga uma mensalidade **fixa mensal**, que já engloba todos os custos da república (aluguel, contas de consumo, alimentação/mercado e despesas operacionais).
  - O app não precisa calcular rateios fracionados complexos de água/luz para moradores, apenas controlar o status de pagamento da mensalidade fixa de cada um.
- **Faturamento de Membros Externos:**
  - Relatório no fechamento do mês somando as refeições/misturas consumidas por cada convidado externo, gerando a cobrança devida a ser repassada para a Caixinha.
- **Painel da Frente Financeiro:**
  - Controle de quem pagou / quem está pendente no mês vigente.
  - Registro de despesas extras e saldo da caixinha (opcional/a detalhar).

### 3.4 Gestão de Suprimentos e Compras Coletivas (Frente Mercado)
- **Ciclo de Compras:** Compras mensais regulares para abastecimento da casa.
- **Catálogo Mestre Pré-definido:** Apenas os membros da Frente Mercado têm permissão para cadastrar, editar e remover itens do catálogo oficial de produtos da casa.
- **Solicitação de Itens Faltantes:** Moradores gerais podem solicitar a compra de itens faltantes exclusivamente selecionando a partir da lista pré-definida do catálogo, mantendo a padronização e organização.
- **Lista Ativa de Compras:** Painel de compras do mês utilizado pelos membros da frente durante a ida ao supermercado, com marcação de itens adquiridos.

### 3.5 Sistema Geral de "Funças" e Frentes Organizacionais
- **Conceito de Funça:** Toda e qualquer tarefa, missão, chamado de reparo ou demanda operacional do dia a dia da república é tratada como uma **Funça**.
- **Abertura de Funças:** Qualquer morador pode abrir uma nova Funça a qualquer momento, fornecendo:
  - Título da funça.
  - Descrição da necessidade.
  - Foto ilustrativa (opcional).
  - Escopo: **Atribuída a uma Frente** específica ou **Geral** (sem frente vinculada).
- **Regras de Atribuição da Funça:**
  - **Funça de Frente:**
    - O Líder da respectiva Frente pode atribuí-la a qualquer membro da sua frente.
    - Qualquer membro daquela frente pode se **autoatribuir** para executá-la.
  - **Funça Geral (sem frente):**
    - Um **Veterano** tem autoridade para atribuir a Funça a um **"Bixo" dele** (obedecendo a hierarquia fixa de gerações: ex.: 024 pode atribuir para 025/026).
    - O **Administrador** da república pode atribuir a Funça a qualquer pessoa da casa.
    - Qualquer morador pode se autoatribuir para puxar a responsabilidade.
- **Painel Centralizado da Reunião Semanal:**
  - Visão consolidada de todas as funças pendentes da casa.
  - Na reunião semanal, a casa repassa funça por funça, alocando os responsáveis finais e definindo prazos para as tarefas que ainda estiverem sem dono.
- **Chat Dedicado por Frente:** Cada frente mantém seu canal interno de mensagens para alinhar as funças e demandas do setor.
- **Submódulo Específico da Frente Dogs:**
  - **Controle de Refeições Diárias:** Checklist das 2 refeições diárias dos cães (Manhã e Noite), com indicação do morador e horário. Reset diário à meia-noite.
  - **Controle de Remédios e Cuidados:** Registro de medicamentos periódicos e alertas de saúde.

### 3.6 Gestão de Caixas de Cerveja (Dívidas Individuais, Tradições e Baixas)
- **Lançamento Estritamente Individual (1 Caixa por Registro):**
  - Cada lançamento no sistema representa exatamente **1 caixa individual de cerveja** (dispensando campos de quantidade fracionada/múltipla). Se houver mais de uma dívida, são criados múltiplos registros individuais.
- **Origem das Caixas:**
  - **Automática:** Gerada ao acumular 7 pontos individuais no mês (penalidade de desorganização).
  - **Manual / Tradições da República:** O Administrador pode criar um lançamento individual para um morador por tradições da casa (ex.: aprovação em estágio, início de namoro, conquistas ou prendas).
- **Campos Obrigatórios no Lançamento:**
  - Morador responsável.
  - Descrição / Motivo do lançamento (ex: *"Passou no estágio da Embraer"*, *"Começou a namorar"*, *"7 pontos em Outubro"*).
  - Data de atribuição.
  - Status: `Pendente`, `Baixa Solicitada`, `Paga / Entregue`.
- **Fluxo de Baixa e Liquidação:**
  - **Solicitação pelo Morador:** O morador que entregou a caixa física pode solicitar a baixa diretamente no app, ficando pendente de confirmação pelo Administrador.
  - **Baixa Direta pelo Administrador:** O Administrador pode liquidar/dar baixa diretamente a qualquer momento, sem necessidade de solicitação prévia.
- **Histórico e Mural de Caixas:** Registro transparente para todos os moradores de quem deve, quem pagou e as histórias por trás de cada cerveja.

### 3.7 Comunicação, Mural e Eventos
- Quadro de avisos importantes.
- Calendário de eventos, reuniões de rep e visitas.
- **Ata da Última Reunião:** qualquer morador ativo da casa pode publicar no app o link da ata mais recente (documento hospedado externamente, ex.: Google Docs). Todos os moradores acessam esse link por um botão na tela inicial. Detalhes na RN12.
- **Link do Drive da República:** botão fixo na tela inicial que abre a pasta compartilhada da casa. O endereço é estático, definido na configuração do app, e não é editável pelos usuários.

---

## 4. Regras de Negócio (RNs)

### RN01 - Cota de Misturas dos Moradores
- Cada morador tem limite de 2 misturas/dia (`1/2` = 1 consumida, `X` = 2 consumidas).
- O custo da alimentação do morador está 100% incluso na sua mensalidade fixa da república.

### RN02 - Cobrança de Refeições de Externos
- Membros externos que almoçarem ou jantarem na casa devem ter o consumo registrado na lista de externos.
- Ao final de cada ciclo mensal, a Frente Financeiro gera o valor devido por cada membro externo com base no total de refeições/misturas acumuladas.

### RN03 - Mensalidade Fixa e Fechamento
- Os moradores pagam um valor mensal único e fixo estipulado pela república.
- A Frente Financeiro é responsável por auditar os pagamentos e registrar a quitação.

### RN04 - Abertura de Ocorrência, Discussão e Assunção de Culpa
- Qualquer morador pode abrir uma ocorrência de desorganização anexando obrigatoriamente uma foto.
- Cada ocorrência possui uma thread de mensagens em tempo real para identificação do autor.
- A imputação do ponto individual ocorre quando o próprio morador responsável clica em "Assumir Ponto" dentro da ocorrência.
- Ao acumular 7 pontos no mês civil, o sistema gera automaticamente 1 pendência de caixa de cerveja individual no nome do morador.
- A contagem de pontos individuais é zerada no primeiro dia de cada mês civil.

### RN05 - Times de Limpeza por Quartos e Upload de Fotos
- A escala semanal de faxina associa áreas comuns a quartos (times).
- A validação da limpeza diária exige envio de foto(s) pelo app.
- Após o envio das fotos, o sistema registra a realização da tarefa no Quadro de Pontos digital.

### RN06 - Penalidades de Quarto Configuráveis
- Se um quarto acumular 2 ou mais faltas/pontos na mesma semana, o sistema aciona uma penalidade coletiva para os integrantes daquele quarto.
- A regra/descrição da penalidade deve ser editável a qualquer momento por um Administrador da república.

### RN07 - Registro Estritamente Unitário e Liquidação de Caixas de Cerveja
- Cada lançamento de caixa de cerveja no sistema representa exatamente 1 unidade individual, acompanhado de data de atribuição, morador e descrição do motivo.
- A liquidação (baixa) só é efetivada no status `Paga` após validação de um Administrador (seja por baixa direta ou por aprovação de solicitação feita pelo morador).

### RN08 - Catálogo de Mercado e Sugestão de Itens
- Somente integrantes da Frente Mercado podem gerenciar o catálogo mestre de produtos.
- Moradores gerais podem solicitar compras apenas a partir de itens cadastrados nesse catálogo mestre.

### RN09 - Abertura e Regras de Atribuição de Funças (Incluindo Reunião Semanal)
- Qualquer morador tem permissão para cadastrar uma nova Funça (com ou sem foto ilustrativa), definindo-a como Geral ou direcionada a uma Frente.
- Na reunião semanal, o coordenador/Admin ou a casa coletivamente pode cadastrar e alocar Funças pendentes aos moradores.
- **Funça de Frente:**
  - O Líder da Frente pode atribuir a tarefa a qualquer integrante da frente.
  - Qualquer integrante da frente pode se autoatribuir para executá-la.
- **Funça Geral:**
  - Um morador de geração veterana pode atribuir a Funça a qualquer morador de geração caloura ("seu bixo"), validado pela hierarquia de gerações (`autor.geracao < alvo.geracao`).
  - O Administrador pode atribuir a Funça a qualquer morador da casa.
  - Qualquer morador pode se autoatribuir.

### RN10 - Controle das Refeições dos Dogs
- O registro das duas refeições diárias dos cães deve indicar o morador responsável e o horário de realização.
- O status zera diariamente à meia-noite para garantir o acompanhamento no dia seguinte.

### RN11 - Canais de Comunicação por Frente (Chats)
- Cada uma das 10 frentes organizacionais possui um canal de mensagens integrado, visível aos seus respectivos integrantes e administradores para alinhamentos contínuos de rotina.

### RN12 - Ata da Última Reunião e Link do Drive
- Qualquer morador ativo da república pode publicar uma ata de reunião, informando a **data da reunião**, o **link** (URL `http`/`https` válida) e, opcionalmente, um título da reunião.
- A "última ata" é sempre a de **maior data de reunião**; as anteriores permanecem no histórico, sem exclusão automática.
- O link do Drive da República é armazenado de forma protegida na tabela `house_settings` do Supabase (com fallback para variável de ambiente durante desenvolvimento), garantindo que a URL privada da pasta não fique exposta no código client-side baixado pelo navegador.
- Ambos os links abrem em uma nova aba/janela do navegador, fora do app.

### RN13 - Autenticação, Aprovação de Moradores e Políticas RLS (Database-First)
- **Criação de Contas:** Clientes não possuem permissão de `INSERT` na tabela `public.profiles`. O registro ocorre exclusivamente via gatilho de banco de dados (`handle_new_user()` em `SECURITY DEFINER`), garantindo que todo novo morador nasça com `ativo = false` e `role = 'morador'`.
- **Aprovação:** Enquanto `ativo = false`, o morador tem o acesso bloqueado e permanece na tela de "Cadastro em Análise". Somente o Administrador (`role = 'admin'` e `ativo = true`) pode aprovar o perfil (`ativo = true`), via `AprovacoesScreen`.
- **Políticas RLS e Trigger de Proteção em `public.profiles`:**
  - `SELECT`: Permitido para todos os usuários autenticados (`authenticated`). Usuários anônimos não podem listar moradores.
  - `INSERT`: Bloqueado para clientes (exclusivo do gatilho no PostgreSQL).
  - `UPDATE`: Administradores podem atualizar qualquer perfil. Moradores comuns podem atualizar apenas seus próprios dados cadastrais permitidos (nome, apelido), com validação dupla: cláusula `WITH CHECK` e gatilho de proteção `trg_protect_profile_roles` que lança exceção em qualquer tentativa de auto-aprovação (`ativo = true`) ou auto-promoção (`role = 'admin'`).
  - `DELETE`: Exclusivo para administradores (recusa de cadastro).
- **Leitura de Quartos:** A tabela `public.rooms` possui política de leitura aberta (`anon` e `authenticated`) para viabilizar a seleção de quarto durante o formulário de cadastro inicial.

### RN14 - Governança das Frentes e Co-Lideranças (Database-First RLS)
- **Visualização:** Qualquer morador autenticado pode consultar os integrantes e líderes de cada frente (`SELECT` em `front_members`).
- **Alocação e Liderança:** Apenas Administradores (`role = 'admin'` e `ativo = true`) possuem permissão para vincular moradores a frentes (`INSERT`), alterar a flag de co-liderança `is_lider` (`UPDATE`), ou desvincular membros (`DELETE`), garantindo integridade auditável no banco de dados.

---

## 5. Requisitos Não Funcionais e Arquitetura Técnica

### 5.1 Plataforma e Distribuição
- **PWA (Progressive Web App):**
  - Instalável via navegador no Android (Chrome - Web APK) e iOS (Safari - Adicionar à Tela de Início).
  - Ícone dedicado, modo tela cheia (*standalone*) e splash screen.
  - Service Worker para cache da aplicação e carregamento instantâneo.

### 5.2 Notificações e Engajamento
- **Web Push Notifications:**
  - Lembrete de envio de fotos de faxina antes do horário limite.
  - Alerta de marcação de ponto individual recebido.
  - Notificações de novos chamados atribuídos na reunião ou pelo líder da frente.

### 5.3 Otimização de Imagens e Armazenamento
- **Compressão Automática:** Como haverá envio diário de fotos de limpeza e chamados de manutenção, o app deve realizar compressão de fotos no cliente antes do upload (ex.: WebP/JPEG com limite máximo de 800 KB por foto) para economizar dados móveis e armazenamento em nuvem.

### 5.4 Stack Tecnológica Recomendada
- **Frontend:** React + TypeScript (Vite) com TailwindCSS e componentes com foco Mobile-first.
- **Backend as a Service (BaaS):** Supabase:
  - **Banco de Dados:** PostgreSQL (com suporte a Row Level Security - RLS para controle refinado de permissões).
  - **Autenticação:** Supabase Auth (E-mail/Senha ou Magic Link para convidados externos).
  - **Storage:** Supabase Storage (baldes para fotos de limpeza e anexos de chamados).
  - **Tempo Real (Realtime):** Atualizações instantâneas na lista de misturas, chamados e quadro de pontos.
