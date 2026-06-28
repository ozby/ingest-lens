# Brewfile — bootstrap every tool this repo depends on.
# Run: brew bundle
# Verify: brew bundle check

# --- Language runtimes ---
brew "node"           # pinned via .nvmrc; use fnm or nvm to activate
brew "bun"            # script runner for local wrappers and unified agent-surface tooling

# --- Package management ---
brew "pnpm"           # repo uses pnpm@9.15.2 (corepack-pinned via packageManager field)

# --- Secrets ---
brew "dopplerhq/cli/doppler"  # all secrets managed via Doppler — no .env files

# --- GitHub / CI ---
brew "gh"             # GitHub CLI: PR review, branch protection checks, Actions runs
brew "act"            # run GitHub Actions locally: act -j <job>

# --- Code quality ---
brew "oxlint"         # linter (mirrors devDependency version via pnpm catalog)

# --- Agent surface ---
brew "rtk"             # CLI proxy that compresses command output; default-on via `wp setup`
