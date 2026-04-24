---
name: monorepo-navigation
description: Navigate the ozbys-node-pubsub monorepo efficiently. Knows package structure, where to find code, dynamic targeting patterns, and cross-package dependencies. Use when unsure where code lives, doing simple read-only file/symbol/pattern lookup, finding imports, or working across packages.
---

# Monorepo Navigation Guide

## Package Structure

### Packages

| Package                   | Path                         | Purpose            | Common Files           |
| ------------------------- | ---------------------------- | ------------------ | ---------------------- |
| `@repo/infra`             | `infra`                      | {{TODO: describe}} | {{TODO: common files}} |
| `@repo/logger`            | `packages/logger`            | {{TODO: describe}} | {{TODO: common files}} |
| `@repo/test-utils`        | `packages/test-utils`        | {{TODO: describe}} | {{TODO: common files}} |
| `@repo/types`             | `packages/types`             | {{TODO: describe}} | {{TODO: common files}} |
| `@repo/typescript-config` | `packages/config-typescript` | {{TODO: describe}} | {{TODO: common files}} |
| `@repo/ui`                | `packages/ui`                | {{TODO: describe}} | {{TODO: common files}} |
| `@repo/workers`           | `apps/workers`               | {{TODO: describe}} | {{TODO: common files}} |
| `client`                  | `apps/client`                | {{TODO: describe}} | {{TODO: common files}} |

<!-- Rendered from pnpm-workspace.yaml / package.json workspace metadata.
     Format: | Package | Path | Purpose | Common Files |
     Purpose + Common Files start as {{TODO: describe ...}} placeholders. -->

### Key Locations

- **Test utilities** (@repo/test-utils): `packages/test-utils`
- **Components** (@repo/ui): look in `packages/ui/src/components/`

{{TODO: refine — the above is heuristic. Add project-specific locations.}}

<!-- Heuristically filled from the package tree:
     "API routes", "Components", "Database schemas", "Tests", etc.
     Left as TODOs if not inferrable. -->

## Preferred Inspection Flow

{{TODO: document your repo's preferred inspection order.
  Typical default: grep → read → trace imports → ask.
  Many repos prefer: IDE jump-to-def first, grep as fallback.}}

## Finding Code

### I need to find...

{{TODO: populate with common queries specific to your repo.
Examples:

- an API route handler → look in ...
- a database query → look in ...
- a React component → look in ...
- a job/queue consumer → look in ...}}

## Cross-Package Import Patterns

### Importing from other packages

```typescript
import {} from /* ... */ "@repo/infra";
import {} from /* ... */ "@repo/logger";
import {} from /* ... */ "@repo/test-utils";
import {} from /* ... */ "@repo/types";
import {} from /* ... */ "@repo/typescript-config";
import {} from /* ... */ "@repo/ui";
```

<!-- From package.json name fields: e.g.,
     import { Button } from '@myorg/ui' -->

### Package names

- `infra` → `@repo/infra`
- `logger` → `@repo/logger`
- `test-utils` → `@repo/test-utils`
- `types` → `@repo/types`
- `typescript-config` → `@repo/typescript-config`
- `ui` → `@repo/ui`
- `workers` → `@repo/workers`
- `client` → `client`
<!-- Short names (for CLI targeting) vs full @scope/name. -->

## Common Workflows

{{TODO: add repo-specific common workflows.
  E.g., "Adding a new API endpoint", "Adding a migration".}}
