#!/bin/bash -i

set -eo pipefail
echo "🚀 Setting up fish-bowl devcontainer..."

# https://github.com/devcontainers/features/pull/770
SHELL="$(which bash)" pnpm setup
source /home/vscode/.bashrc
pnpm config set store-dir $PNPM_HOME/store

echo "Initializing submodules"
git submodule update --init --recursive

echo "📦 Installing repo dependencies..."
corepack install
corepack enable
pnpm install

echo "🏗️ Building..."
pnpm build

echo "🧪 Testing..."
pnpm test

echo "✅ Devcontainer setup complete!"
echo "🙏 Thank you for contributing to fish-bowl!"
echo "📝 P.S Don't forget to configure your git credentials with 'git config --global user.name you' and 'git config --global user.email you@z.com'"
