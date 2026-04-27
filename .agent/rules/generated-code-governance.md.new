---
paths:
  - 'schema/**/*.yaml'
  - '.generated/**'
  - 'apps/**/generated/**'
last_updated: 2026-04-22
---

# Generated Code Governance

## Source of Truth

- Generated artifacts from declarative schema files live under a single
  checked-in output root (commonly `.generated/` or `@myorg/generated`).
- The root `package.json` inside that output directory is a tracked workspace
  package stub — keep it, do not treat it as a regenerated payload.
- Authored truth stays in the declarative schema directory (e.g. `schema/`,
  `entities/`) and generator source files.
- Never create duplicate package-local or app-local generated mirrors, and
  never edit generated files directly.

## Frontend Codegen Source of Truth

Entity / schema declarations typically own:

- Route configuration (app, layout, paths)
- UI hints (list / detail / form)
- Edit / delete capabilities derived from the permissions block

## Commands

Use your repo's wrapped recipes for regeneration. Typical surface:

- Full regeneration (all emitters)
- ORM / database schema only
- Runtime artifact fragments only
- Schema validate (static + runtime)
- Schema apply (push + validate + apply)
- SDK only
- Frontend pages / hooks
- Frontend drift check

Wire these to your task runner of choice (`just`, `pnpm`, `turbo`, make). The
rule that matters is that **there is exactly one way to regenerate each
emitter**, and agents use it.

## Import Rules

Prefer the package export surface of the generated package:

```
✅ @myorg/generated/frontend/entities
✅ @myorg/generated/frontend/routes/*
✅ @myorg/generated/frontend/nav/*
✅ @myorg/generated/frontend/hooks/*
✅ @myorg/generated/frontend/query-keys
✅ @myorg/generated/config/*
✅ @myorg/generated/runtime/*
✅ Declare @myorg/generated in `dependencies` when a package or app imports
    it directly
```

```
❌ Package-local mirrors such as packages/**/src/generated/frontend/**
❌ App-local generated/ folders or codegen paths outside the canonical
    generator outputs
❌ Deep relative imports into the generated root from normal source files
❌ tsconfig.paths / Vite aliases / Vitest aliases that remap
    @myorg/generated/*
❌ Editing generated frontend routes or hooks directly
```

## Enforcement

- Generation runs in deploy / dev setup scripts.
- Emitters live in one clearly-named package (e.g. `@myorg/schema-engine`).
- Pre-commit and CI should catch drift between authored source and checked-in
  generated output.
