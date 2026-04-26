# justfile — task runner.
# Delegates to pnpm (app tasks) and deploy scripts (infra tasks).
# The ak-stop-qa hook calls `just typecheck [--file f]...` and `just test [--file f]...`.

typecheck *args:
    pnpm --filter @repo/workers check-types

test *args:
    #!/usr/bin/env bash
    set -euo pipefail
    files=()
    args_arr=($@)
    i=0
    while [[ $i -lt ${#args_arr[@]} ]]; do
        if [[ "${args_arr[$i]}" == "--file" ]]; then
            i=$((i+1))
            files+=("${args_arr[$i]}")
        fi
        i=$((i+1))
    done
    if [[ ${#files[@]} -gt 0 ]]; then
        pnpm --filter @repo/workers exec vitest run "${files[@]}"
    else
        pnpm --filter @repo/workers test
    fi

# Deploy a stack end-to-end: pulumi up → sync wrangler IDs → wrangler deploy.
deploy stack:
    cd infra && bun ./src/deploy/deploy.ts {{stack}}

# Pulumi preview (dry run) for a stack.
pulumi-preview stack:
    with-secrets --doppler ozby-shell:{{if stack == "prd" { "production" } else { stack }}} -- pulumi preview --stack {{stack}}
