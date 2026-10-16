#!/usr/bin/env bash
set -e

# ==============================================================================
# Helper de Remoção de Git Worktrees - República Canta Grillo
# Uso: ./scripts/remover-worktree.sh <nome-da-feature>
# Exemplo: ./scripts/remover-worktree.sh caixas-cerveja
# ==============================================================================

FEATURE_NAME="$1"

if [ -z "$FEATURE_NAME" ]; then
  echo "Erro: Forneça o nome da feature."
  echo "Uso: $0 <nome-da-feature>"
  echo "Exemplo: $0 caixas-cerveja"
  exit 1
fi

MAIN_REPO="/home/ciosaki/hd/canta-grillo-app"
WORKTREE_ROOT="$MAIN_REPO/.worktrees"
TARGET_DIR="$WORKTREE_ROOT/$FEATURE_NAME"

if [ ! -d "$TARGET_DIR" ]; then
  echo "Aviso: Diretório $TARGET_DIR não encontrado."
  exit 1
fi

echo "Removendo worktree em $TARGET_DIR..."
git worktree remove "$TARGET_DIR"
git worktree prune

echo "Worktree '$FEATURE_NAME' removido com sucesso!"
