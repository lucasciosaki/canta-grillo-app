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
- **Controle para Membros Externos / Convidados (RN16):**
  - Cadastro rápido via link de convite (`?convite=externo`) ou compartilhamento via WhatsApp.
  - Ativação imediata (`ativo = true`, `role = 'externo'`) para registrar refeição na hora.
  - Marcação binária: presença na casa = 1 refeição (não fraciona, valor fixo unitário da casa).
  - Tela dedicada e isolada (`ConvidadoScreen`) com histórico mensal individual.
  - Listagem separada na folha digital da casa e soma integrada no painel da cozinha.
  - Consolidação mensal de quantas refeições cada membro externo consumiu para acerto da Caixinha.
- **Preparação das Refeições:**
  - A casa conta com funcionária/cozinheira dedicada; o app **não** precisa gerenciar escalas de quem cozinha.
- **Ciclo Diário:**
  - As marcações resetam diariamente à meia-noite (com histórico arquivado para auditoria).

### 3.2 Gestão de Limpeza, Pontos e Organização da Casa

#### 3.2.1 Sistema de Pontos Individuais (Pontos de Bagunça)
- **Abertura de Ponto de Bagunça com Foto Obrigatória:** Ao encontrar um item ou área desorganizada (ex.: copo na pia/sala, prato jogado, lixo fora do lugar), qualquer morador tira uma foto e registra um Ponto de Bagunça (`PontoBagunca`) no app com o registro visual da infração.
- **Thread / Chat de Discussão por Ponto de Bagunça:** Cada Ponto de Bagunça aberto possui um chat dedicado onde os moradores podem debater, identificar o autor e esclarecer o ocorrido.
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

### RN04 - Abertura de Ponto de Bagunça, Regra de 24h com Blur, Discussão e Assunção de Culpa
- **Abertura com Foto Obrigatória:** Qualquer morador ativo pode abrir um Ponto de Bagunça anexando obrigatoriamente uma foto (comprimida no cliente para no máximo 1024px e qualidade 0.75) e indicando o que e onde está o item fora do lugar.
- **Mecânica de Blur e Visualização Individual:**
  - O ponto de bagunça nasce no carrossel da Home com **filtro de desfoque (`blur`)** para todos os moradores da casa, exceto para o próprio relator (autor da denúncia).
  - Cada morador deve tocar no card para abrir e ver a foto pela primeira vez. Ao clicar, o blur é removido permanentemente para aquele morador e a leitura é registrada na tabela `pontos_bagunca_visualizacoes`.
- **Prazo Limite de 24 Horas e Penalidade Automática:**
  - Cada ponto possui um cronômetro regressivo com prazo de **24 horas** a contar do momento da publicação (`created_at`).
  - Todo morador ativo da casa que **não abrir a imagem dentro das primeiras 24 horas** recebe automaticamente **1 ponto de bagunça administrativo**. A verificação é executada via função do banco `public.verificar_penalidades_pontos_24h()`.
  - **Resolução Antecipada:** Se o culpado assumir a infração antes de expirar as 24h (`status = 'assumida'`), o ponto é imediatamente encerrado e nenhum outro morador é penalizado por falta de visualização.
- **Discussão em Tempo Real:** Cada Ponto de Bagunça possui uma thread de mensagens em tempo real (`mensagens_ponto_bagunca`), com identificação estrita pelo **apelido** dos moradores (nunca o nome civil).
- **Assunção do Ponto e Cervejas:**
  - O próprio morador responsável clica em "Assumir Ponto", imputando a infração a si mesmo.
  - Ao acumular 7 pontos no mês civil, o sistema gera automaticamente 1 pendência de caixa de cerveja individual no nome do morador.
  - A contagem de pontos individuais é zerada no primeiro dia de cada mês civil.
- **Políticas RLS em `pontos_bagunca_visualizacoes`:**
  - `SELECT`: Permitido para todos os usuários autenticados (`authenticated`).
  - `INSERT`: Permitido para moradores ativos (`public.is_active_morador()`) registrando estritamente a sua própria visualização (`morador_id = auth.uid()`).

### RN05 - Times de Limpeza por Quartos, Rodízio Linear e Fiscalização do Halls
- **6 Funções e 6 Quartos da Casa:**
  - As 6 áreas fixas de arrumação diária são: **Sala de TV**, **Sala de Estudos**, **Externo**, **Dispensa**, **Cozinha** e **Halls**.
  - Os 6 quartos da casa (Carandiru, High School, Principal, Quádruplo, Triplo e Varanda) cumprem um rodízio semanal linear e circular: a cada virada de semana (Domingo às 01:00 BRT), cada quarto avança automaticamente 1 posição na sequência de funções ($Q_i \rightarrow F_{(i+1) \pmod 6}$).
- **Corte Diário às 01:00 BRT (Backend Node.js):**
  - A rotina agendada do backend roda diariamente às 01:00 BRT (`America/Sao_Paulo`).
  - Todo quarto que não tiver enviado a foto comprovando a limpeza da sua área até as 01:00 recebe automaticamente **1 falta (+1 ponto no Quadro de Pontos da semana)**, e o status é marcado como `faltou`.
- **Papel Duplo do Fiscal (Halls):**
  - O quarto escalado no **Halls** deve fotografar o Hall limpo normalmente (sua tarefa diária).
  - Além disso, atua como **Fiscal** das outras 5 funções da casa. Pelo Painel do Fiscal, pode dar check de **Aprovação** ou registrar **Reprovação** (com justificativa obrigatória e foto opcional de contraprova).
  - **Reprovação Expressa:** Se o fiscal reprovar o serviço, o quarto avaliado toma imediatamente 1 falta na escala da semana.
  - **Auditoria das 11:00 BRT & Omissão:** O fiscal tem até as 11:00 da manhã seguinte para avaliar todas as funções concluídas. Se o fiscal deixar funções sem parecer, a rotina marca `omitido` e o quarto do **Halls toma no máximo 1 falta por omissão no dia**. Além disso, se o quarto do Halls **já tiver tomado falta às 01:00 por não ter tirado a foto do próprio Hall, ele não toma uma segunda falta por omissão de fiscalização no mesmo dia**.

### RN06 - Penalidades Progressivas do Quadro de Pontos (2 a 7 Faltas) e Políticas RLS da Faxina
- **Escalada Progressiva de Penalidades (2 a 7 Faltas):**
  - O sistema implementa uma tabela progressiva de punições configuráveis de **2 a 7 faltas acumuladas na mesma semana**.
  - Quartos com 0 ou 1 falta estão livres de penalidades.
  - A partir de 2 faltas, o quarto recebe a penalidade exata do nível acumulado no Quadro de Pontos:
    - **2 Faltas:** Penalidade inicial (Padrão: *Pagar 1 caixa de cerveja para a casa*).
    - **3 Faltas:** Segundo patamar (Padrão: *Pagar 2 caixas de cerveja para a casa*).
    - **4 Faltas:** Terceiro patamar (Padrão: *Lavar a cozinha no domingo + 2 caixas*).
    - **5 Faltas:** Quarto patamar (Padrão: *Faxina geral da área externa + 3 caixas*).
    - **6 Faltas:** Quinto patamar (Padrão: *Faxina pesada da república inteira*).
    - **7 Faltas:** Pena máxima (Padrão: *Churrasco por conta do quarto*).
  - Caso um quarto ultrapasse 7 faltas, mantém-se a penalidade máxima estabelecida para o nível 7.
- **Painel de Configuração do Administrador:**
  - O Administrador da república pode visualizar e editar as descrições de todas as 6 regras (níveis 2 a 7) diretamente na aba dedicada do modal de administração.
  - As regras são persistidas na tabela `public.regras_quadro_pontos` e sincronizadas em tempo real via Supabase Realtime.
- **Exibição na Interface:**
  - Na aba "Quadro Geral", exibe-se um card expansível/recolhível com a lista dos 7 níveis de punição.
  - No card de cada quarto com $\ge 2$ faltas, exibe-se em destaque a punição específica correspondente ao total de faltas do quarto.
- **Governança e Políticas RLS (Database-First):**
  - **`regras_quadro_pontos`**: Chave primária `pontos INT CHECK (pontos BETWEEN 2 AND 7)`. Leitura pública para todos (`SELECT TO anon, authenticated USING (true)`). Inserção e atualização permitidas para Administradores e moradores ativos (`ALL TO authenticated USING (is_admin() OR is_active_morador())`).
  - **`areas_comuns`**: Leitura permitida para todos os autenticados (`SELECT`). Inserção e atualização permitidas para Administradores e moradores ativos (`public.is_admin() OR public.is_active_morador()`).
  - **`escala_semanal_faxina`**: Leitura pública para autenticados (`SELECT`). Gestão e inicialização permitidas para Administradores e moradores ativos (`ALL`).
  - **`registro_diario_faxina`**: Leitura aberta para autenticados (`SELECT`). Inserção de foto e avaliação de fiscalização permitidas para Administradores e moradores ativos (`ALL`).
  - **Identificação Estrita por Apelido:** Todas as referências visuais aos moradores e administradores na interface e no histórico de avaliações exibem estritamente o **apelido** cadastrado.

### RN07 - Registro Estritamente Unitário, Liquidação de Caixas de Cerveja e Políticas RLS
- **Lançamento Estritamente Unitário:** Cada lançamento de caixa de cerveja no sistema representa exatamente 1 unidade individual (sem campos de quantidade fracionada ou múltipla).
- **Origem das Caixas:**
  - **Automática (`origem = 'pontos'`):** Gerada automaticamente via trigger ao acumular 7 pontos de bagunça assumidos no mês civil (ou múltiplos de 7).
  - **Manual / Tradições (`origem = 'manual'`):** Lançada exclusivamente pelo Administrador por conquistas ou tradições da casa (estágio, namoro, prendas, etc.).
- **Ciclo de Vida e Status:**
  - `Pendente`: Caixa devida e em aberto.
  - `Baixa Solicitada`: Morador entregou a caixa física e solicitou baixa no app (`solicitada_em = NOW()`).
  - `Paga`: Liquidação confirmada pelo Admin (`baixada_em = NOW()`, `baixada_por = auth.uid()`), seja aprovando solicitação ou por baixa direta.
  - **Recusa/Devolução:** O Admin pode recusar uma solicitação em análise, retornando o status para `Pendente` e limpando `solicitada_em`.
- **Interface Centrada em Moradores:**
  - A tela de Cervejas lista todos os moradores ativos da república em formato expansível (Accordion), mostrando quantas e quais caixas cada um deve.
  - Moradores com mais pendências aparecem no topo; moradores zerados aparecem com `0 caixas`.
  - Aba secundária de Histórico exibindo todas as caixas já pagas em ordem cronológica reversa com auditoria do Admin responsável pela baixa.
- **Identificação Estrita por Apelido:** Todas as referências visuais na interface exibem estritamente o apelido cadastrado do morador.
- **Governança e Políticas RLS (Database-First):**
  - `SELECT`: Permitido para Administradores e Moradores ativos (`public.is_admin() OR public.is_active_morador()`).
  - `INSERT`: Exclusivo para Administradores via client-side.
  - `UPDATE`: Administrador gerencia qualquer status; Morador ativo pode apenas solicitar baixa da sua própria caixa pendente. Gatilho de segurança `trg_protect_caixas_cerveja_update` blinda colunas imutáveis.
  - `DELETE`: Exclusivo para Administradores (estorno de lançamentos equivocados).
  - `Realtime`: Integrada à publicação `supabase_realtime`.

### RN08 - Catálogo de Mercado, Sugestão de Itens e Governança RLS
- **Gestão do Catálogo:** Somente integrantes da Frente Mercado (`public.is_front_member_by_slug('mercado')`) e Administradores possuem permissão de escrita (`INSERT`, `UPDATE`, `DELETE`) na tabela `public.market_catalog`.
- **Solicitações de Compra:** Qualquer morador ativo (`public.is_active_morador()`) pode visualizar o catálogo mestre e cadastrar solicitações de reposição (`INSERT` em `public.solicitacoes_mercado` com `status = 'solicitado'`).
- **Checklist de Compras do Mês:** Na ida ao supermercado, apenas integrantes da Frente Mercado e Administradores podem atualizar o status da compra (`UPDATE public.solicitacoes_mercado SET status = 'comprado'`).
- **Atalho Rápido:** Disponibilizado modal de solicitação rápida acessível a qualquer morador ativo a partir do topo da tela de Frentes.

### RN09 - Abertura, Governança e Regras de Atribuição de Funças (Incluindo Reunião Semanal e Painel da Frente)
- **Abertura e Multi-responsáveis:** Qualquer morador ativo tem permissão para cadastrar uma nova Funça (com título, descrição, prazo opcional e foto ilustrativa opcional), definindo-a como Geral ou direcionada a uma Frente. Uma funça pode ter múltiplos responsáveis simultâneos (`(funca_id, morador_id)`).
- **Ciclo Manual em 3 Etapas:** `aberta` -> `em_andamento` -> `concluida`. Atribuir responsáveis não muda o status automaticamente; a funça permanece aberta até que um responsável atribuído, líder da frente, relator ou Admin clique em "Iniciar (Em andamento)" e posteriormente em "Concluir Funça".
- **Painel da Frente:** Na página dedicada de cada uma das 10 frentes organizacionais, a aba "Painel da Frente" lista todas as Funças pendentes (`aberta` e `em_andamento`) vinculadas àquela comissão, com ações rápidas de criação de funça da frente, autoatribuição e atalho para o mural geral.
- **Funça de Frente:**
  - O Líder da Frente pode atribuir a tarefa a qualquer integrante da frente (`tipo_atribuicao = 'lider_frente'`).
  - Qualquer integrante da frente pode se autoatribuir para executá-la (`tipo_atribuicao = 'autoatribuicao'`).
  - O Administrador pode atribuir a qualquer morador ativo (`tipo_atribuicao = 'admin_geral'`).
- **Funça Geral:**
  - Qualquer morador ativo veterano pode atribuir qualquer Funça Geral pendente a um morador calouro ("seu bixo"), validado pela hierarquia numérica de gerações (`geracao_num(autor) < geracao_num(alvo)`), com `tipo_atribuicao = 'veterano_bixo'`.
  - O Administrador pode atribuir a Funça a qualquer morador da casa (`tipo_atribuicao = 'admin_geral'`).
  - Qualquer morador ativo pode se autoatribuir (`tipo_atribuicao = 'autoatribuicao'`).
- **Painel da Reunião Semanal:**
  - Qualquer morador ativo operando a reunião semanal pode criar múltiplas funças rapidamente em lote (planilha/linhas dinâmicas) e alocar responsáveis diretamente com `tipo_atribuicao = 'reuniao'`.
  - Triagem coletiva das funças pendentes com foco nas "Sem dono", permitindo definir prazos e responsáveis inline.
- **Remoção de Responsável vs. Solicitação de Troca:**
  - Remoção direta permitida exclusivamente a Administradores, Líderes da frente da funça ou ao Veterano do morador atribuído (inclusive em Funça de Frente).
  - O responsável comum não pode se remover sozinho: ele pode solicitar troca para qualquer morador ativo da casa (`troca_solicitada_para`), que deve aceitar via RPC `public.aceitar_troca_funca` para que a responsabilidade seja transferida.
- **Identificação e Segurança (Database-First RLS):**
  - Exibição estrita pelo apelido em todos os componentes da interface.
  - Políticas de RLS nas tabelas `public.funcas` e `public.funca_atribuicoes` e sincronização instantânea via Supabase Realtime.

### RN10 - Controle das Refeições dos Dogs (Manhã e Noite) e Políticas RLS
- O registro das duas refeições diárias dos cães (`manha` e `noite`) na tabela `public.dogs_refeicoes_diarias` indica o morador responsável (sempre exibido por **apelido**), horário de realização e observações adicionais.
- **Políticas RLS:** Qualquer morador ativo ou administrador pode registrar a refeição no dia corrente (`data = CURRENT_DATE` e `alimentado_por = auth.uid()`). A exclusão/desmarcação no dia é restrita ao autor da marcação, membros da Frente Dogs ou administrador.
- **Atalho Rápido:** Além da aba exclusiva na página da Frente Dogs, a tela inicial de Frentes disponibiliza atalho rápido "Alimentar Dogs" para que qualquer morador da casa possa cumprir e assinar o checklist na hora.

### RN11 - Canais de Comunicação por Frente (Chats em Tempo Real) e Políticas RLS
- Cada uma das 10 frentes organizacionais possui um canal de mensagens privativo (`public.mensagens_frente`), sincronizado instantaneamente via Supabase Realtime (`supabase_realtime`).
- **Isolamento de Segurança (RLS Database-First):**
  - `SELECT`: Liberado exclusivamente para integrantes daquela frente (`public.is_front_member(frente_id)`) e Administradores da república (`public.is_admin()`). Moradores não-membros têm leitura estritamente bloqueada.
  - `INSERT`: Liberado para integrantes da frente e administradores, exigindo estritamente `autor_id = auth.uid()`.
  - `DELETE`: Permitido ao autor da mensagem ou administrador.
- **Identificação Estrita por Apelido:** Todas as mensagens exibem o **apelido** do autor e destacam badge de Líder (`⭐`) caso o autor possua `is_lider = true` naquela frente.

### RN12 - Ata da Última Reunião e Link do Drive
- Qualquer morador ativo da república pode publicar uma ata de reunião, informando a **data da reunião**, o **link** (URL `http`/`https` válida) e, opcionalmente, um título da reunião.
- A "última ata" é sempre a de **maior data de reunião**; as anteriores permanecem no histórico, sem exclusão automática.
- O link do Drive da República é armazenado de forma protegida na tabela `house_settings` do Supabase (com fallback para variável de ambiente durante desenvolvimento), garantindo que a URL privada da pasta não fique exposta no código client-side baixado pelo navegador.
- Ambos os links abrem em uma nova aba/janela do navegador, fora do app.

### RN13 - Autenticação, Meu Perfil, Gestão de Moradores e Políticas RLS (Database-First)
- **Criação de Contas:** Clientes não possuem permissão de `INSERT` na tabela `public.profiles`. O registro ocorre exclusivamente via gatilho de banco de dados (`handle_new_user()` em `SECURITY DEFINER`), garantindo que todo novo morador nasça com `ativo = false` e `role = 'morador'`.
- **Tela "Meu Perfil & Quarto" (`MeuPerfilScreen.tsx`):**
  - Acessível a qualquer morador ativo através da aba `Casa` e pelo toque no cabeçalho de geração/quarto na `Home`.
  - **Configuração de Foto de Perfil (Avatar):**
    - Permite tirar foto com a câmera do celular ou escolher imagem da galeria (`input[type="file"]`).
    - Validação de formato (apenas imagens) e limite de tamanho bruto (máximo 5MB).
    - Recorte central automático em proporção quadrada e compressão inteligente client-side (512x512 pixels em JPEG 85%), gerando arquivo leve (~50-80KB) ideal para conexões móveis.
    - Upload automático para o bucket público `avatars` do Supabase Storage, persistindo a URL pública em `public.profiles.avatar_url`.
    - Fallback resiliente: caso o Supabase Storage esteja momentaneamente indisponível, armazena Data URL base64 mantendo a interface 100% operacional.
    - Opção de remover a foto existente a qualquer momento (`avatar_url = null`).
  - Permite a edição imediata do **Apelido na República** (destaque de interface), **Nome Completo** e **Quarto Atual** (`quarto_id` vinculado a `public.rooms`).
  - O campo **Geração** permanece em somente-leitura para moradores comuns (com aviso orientador na interface), sendo editável unicamente por administradores.
  - Ao salvar, a atualização via Supabase atualiza a sessão imediatamente com `refreshProfile()`.
- **Central de Gestão de Membros da Casa (Exclusivo Admin - `AprovacoesScreen.tsx`):**
  - **Aba Pendentes (`ativo = false`):** Aprovação de novos moradores (`ativo = true`) ou recusa/remoção (`DELETE`), com exibição de avatar ou iniciais.
  - **Aba Moradores Ativos (`role IN ('morador', 'admin') AND ativo = true`):** Lista todos os membros da república com foto, permitindo ao Administrador editar apelido, nome, geração, quarto atual, alternar cargo (`morador` <-> `admin`), remover foto inadequada, desativar acesso (`ativo = false`) ou remover o morador da base.
  - **Proteção de Auto-Preservação do Admin:** O Admin logado é estritamente impedido de rebaixar seu próprio cargo, desativar seu próprio acesso ou excluir a si mesmo da república, evitando perda acidental de governança do sistema.
  - **Aba Convidados Externos (`role = 'externo'`):** Centraliza os agregados da folha de misturas com foto/iniciais, exibindo telefone/WhatsApp com link direto, alternância de status ativo/inativo e edição cadastral.
- **Políticas RLS e Trigger de Proteção em `public.profiles` e `storage.objects`:**
  - `SELECT`: Permitido para todos os usuários autenticados (`authenticated`). Usuários anônimos não podem listar moradores.
  - `INSERT`: Bloqueado para clientes (exclusivo do gatilho `handle_new_user` no PostgreSQL).
  - `UPDATE`: Administradores podem atualizar qualquer perfil. Moradores comuns podem atualizar apenas seus próprios dados cadastrais permitidos (nome, apelido, quarto, avatar_url), com validação dupla: cláusula `WITH CHECK` e gatilho de proteção `trg_protect_profile_roles` (`public.protect_profile_roles()`) que lança exceção em qualquer tentativa de auto-aprovação (`ativo = true`), auto-promoção (`role = 'admin'`) ou alteração de geração (`geracao`), blindando a hierarquia Veterano -> Bixo.
  - `DELETE`: Exclusivo para administradores (`public.is_admin()`).
  - **Storage Bucket `avatars`:** Bucket público com RLS em `storage.objects`: `SELECT` aberto para leitura pública; `INSERT`, `UPDATE` e `DELETE` restritos ao dono da imagem autenticado (`name LIKE 'avatar_' || auth.uid() || '_%'`) ou Administradores (`public.is_admin()`).
- **Leitura de Quartos:** A tabela `public.rooms` possui política de leitura aberta (`anon` e `authenticated`) para viabilizar a seleção de quarto durante o formulário de cadastro inicial e na tela de perfil.

### RN14 - Governança das Frentes e Co-Lideranças (Database-First RLS)
- **Visualização:** Qualquer morador autenticado pode consultar os integrantes e líderes de cada frente (`SELECT` em `front_members`).
- **Alocação e Liderança:** Apenas Administradores (`role = 'admin'` e `ativo = true`) possuem permissão para vincular moradores a frentes (`INSERT`), alterar a flag de co-liderança `is_lider` (`UPDATE`), ou desvincular membros (`DELETE`). A política de `INSERT` e os seletores de interface restringem estritamente os membros a moradores ativos da república (`role IN ('morador', 'admin') AND ativo = true`), impedindo que convidados externos (`role = 'externo'`) sejam vinculados a frentes organizacionais.

### RN15 - Folha de Misturas Digital e Políticas RLS (daily_meals)
- **Visualização:** Todos os moradores autenticados (`authenticated`) podem consultar o quadro de refeições diárias da casa (`SELECT` em `daily_meals`). Usuários anônimos têm acesso negado.
- **Marcação e Atualização (Exclusivas do Dia Vigente):**
  - Moradores comuns ativos (`ativo = true`) têm permissão para inserir e atualizar (`INSERT` e `UPDATE`) exclusivamente a sua própria linha de refeição do dia de hoje (`data = CURRENT_DATE` e `usuario_id = auth.uid()`).
  - Dias anteriores (`data < CURRENT_DATE`) permanecem 100% visualizáveis no histórico para consulta e auditoria da casa, mas com alterações estritamente bloqueadas na interface e rejeitadas nas políticas RLS do PostgreSQL.
  - Moradores inativos (`ativo = false`) têm permissão bloqueada por RLS.
  - Administradores da república (`public.is_admin()`) têm permissão para inserir ou atualizar a refeição de qualquer morador no dia de hoje (para auxílio e auditoria da cozinha).
- **Valores Permitidos:** `0.0` (não vai comer / `—`), `0.5` (1 mistura / almoço / `1/2`), `1.0` (2 misturas / cota completa / `X`).
- **Bloqueio de Datas Futuras:** O app e as regras de negócio proíbem estritamente a navegação ou marcação de refeições para dias posteriores à data atual (`data > CURRENT_DATE`). O seletor de dia desativa o botão de próximo dia ao alcançar a data de hoje.
- **Sincronização em Tempo Real:** A tabela `daily_meals` é transmitida via `supabase_realtime` para que a folha digital atualize instantaneamente em todos os celulares da casa a cada nova marcação.

### RN16 - Membros Externos e Convidados (Link de Convite, Tela Dedicada e RLS)
- **Link de Convite e Compartilhamento:**
  - Gerado com parâmetro de convite (`${origin}/?convite=externo`), permitindo envio via clipboard ou botão direto de WhatsApp.
  - Ao abrir o link, a tela de autenticação ativa diretamente a aba "Convidado".
- **Cadastro Simplificado e Ativação Imediata:**
  - Requer apenas: `apelido na rep`, `telefone/WhatsApp` (para cobrança pelo Caixa), `e-mail` e `senha`. Não exige nem quarto nem geração.
  - O gatilho `handle_new_user()` cria o perfil com `role = 'externo'`, `ativo = true` imediatamente (sem funil de aprovação pelo admin), possibilitando o registro imediato do almoço no mesmo dia.
- **Isolamento de Interface (`ConvidadoScreen`):**
  - O `AuthGuard` intercepta usuários com `role === 'externo'` e renderiza exclusivamente a `ConvidadoScreen`.
  - Convidados têm visão estritamente restrita: saudação pelo apelido, botão de 1 toque para confirmar que almoçou/jantou hoje, histórico de refeições no mês e botão de logout. Não têm acesso a nenhuma área interna da casa (frentes, faxina, pontos de bagunça, caixas de cerveja ou atas).
- **Consumo Binário e Resumo da Cozinha:**
  - A marcação do convidado é binária: `1.0` (comeu na república hoje) ou `0.0` (não marcou / cancelou). Não há fracionamento de cota, visto que o preço de refeição avulsa para convidados é unitário.
  - A folha de misturas dos moradores (`MisturasScreen`) lista os convidados cadastrados na seção "Convidados & Agregados" e agrega o total de convidados na contagem consolidada da cozinha. Administradores podem alternar a marcação de convidados no dia vigente.
- **Políticas RLS em `daily_meals` e `profiles`:**
  - `is_active_externo()`: Função helper SQL que valida `auth.uid()` como convidado ativo (`role = 'externo' AND ativo = true`).
  - `daily_meals`: Convidado ativo pode ler (`SELECT`), inserir (`INSERT`), atualizar (`UPDATE`) e excluir (`DELETE`) apenas os seus próprios registros no dia de hoje (`usuario_id = auth.uid() AND data = CURRENT_DATE`).
  - `profiles`: Convidado ativo pode atualizar apenas seus próprios dados cadastrais permitidos (`role IN ('morador', 'externo')`). Moradores ativos e Administradores continuam autorizados a consultar os perfis dos convidados.

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
