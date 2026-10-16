#!/usr/bin/env bash
set -e

# ==============================================================================
# Helper de Criação de Git Worktrees - República Canta Grillo
# Uso: ./scripts/novo-worktree.sh <nome-da-feature> [branch-base]
# Exemplo: ./scripts/novo-worktree.sh frente-mercado main
# ==============================================================================

FEATURE_NAME="$1"
BASE_BRANCH="${2:-main}"

if [ -z "$FEATURE_NAME" ]; then
  echo "Erro: Forneça o nome da feature."
  echo "Uso: $0 <nome-da-feature> [branch-base]"
  echo "Exemplo: $0 frente-mercado main"
  exit 1
fi

MAIN_REPO="/home/ciosaki/hd/canta-grillo-app"
WORKTREE_ROOT="$MAIN_REPO/.worktrees"
BRANCH_NAME="feature/$FEATURE_NAME"
TARGET_DIR="$WORKTREE_ROOT/$FEATURE_NAME"

mkdir -p "$WORKTREE_ROOT"

if [ -d "$TARGET_DIR" ]; then
  echo "Aviso: O diretório $TARGET_DIR já existe."
  exit 1
fi

echo "Criando worktree para '$BRANCH_NAME' em $TARGET_DIR a partir de $BASE_BRANCH..."

# Verifica se a branch já existe localmente
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  git worktree add "$TARGET_DIR" "$BRANCH_NAME"
else
  git worktree add -b "$BRANCH_NAME" "$TARGET_DIR" "$BASE_BRANCH"
fi

# Copia .env do repositório principal
if [ -f "$MAIN_REPO/.env" ]; then
  cp "$MAIN_REPO/.env" "$TARGET_DIR/.env"
  echo "Arquivo .env configurado."
fi

# Cria symlink de node_modules (instantâneo, sem ocupar disco extra)
if [ -d "$MAIN_REPO/node_modules" ]; then
  ln -s "$MAIN_REPO/node_modules" "$TARGET_DIR/node_modules"
  echo "Link simbólico de node_modules criado com sucesso."
fi

echo ""
echo "=============================================================================="
echo "Worktree criado com sucesso!"
echo "Diretório: $TARGET_DIR"
echo "Branch:    $BRANCH_NAME"
echo ""
echo "Para abrir um novo agente nesta feature:"
echo "1. Abra uma nova janela no Antigravity / VS Code."
echo "2. Abra a pasta: $TARGET_DIR"
echo "3. Abra uma nova conversa de chat para instruir o agente nessa feature."
echo "=============================================================================="
