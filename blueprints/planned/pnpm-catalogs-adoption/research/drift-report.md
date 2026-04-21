# Catalog Drift Report

Generated: 2026-04-22

## Deps used in ≥2 workspaces NOT yet in catalog

All entries below have explicit version strings and no `catalog:` reference.
The `pnpm-workspace.yaml` had no catalog block at all before this blueprint.

### Shared runtime deps (≥2 apps/*)

| Package | Workspaces | Version used |
|---------|-----------|--------------|
| axios | api-server, notification-server, client | ^1.8.3 |
| cors | api-server, notification-server | ^2.8.5 |
| express | api-server, notification-server | ^5.0.1 |
| morgan | api-server, notification-server | ^1.10.0 |
| dotenv | api-server, notification-server, client | ^16.3.1 / ^16.4.5 |
| helmet | api-server, notification-server | ^7.1.0 |
| jsonwebtoken | api-server, notification-server | ^9.0.2 |
| mongodb-memory-server | api-server, notification-server | ^10.1.4 |
| mongoose | api-server, notification-server | ^8.0.3 |
| uuid | api-server, notification-server | ^9.0.1 |
| winston | api-server, notification-server | ^3.11.0 |

### Shared UI/frontend deps (client + packages/ui)

| Package | Workspaces | Version used |
|---------|-----------|--------------|
| react | client, packages/ui (peerDep) | ^18.3.1 |
| react-dom | client, packages/ui (peerDep) | ^18.3.1 |
| react-hook-form | client, packages/ui | ^7.53.0 |
| class-variance-authority | client, packages/ui | ^0.7.1 |
| lucide-react | client, packages/ui | ^0.462.0 |
| clsx | client, packages/ui | ^2.1.1 |
| next-themes | client, packages/ui | ^0.3.0 |
| sonner | client, packages/ui | ^1.5.0 |
| tailwind-merge | client, packages/ui | ^2.5.2 |
| tailwindcss | client, packages/ui | ^3.4.11 |
| tailwindcss-animate | client, packages/ui | ^1.0.7 |
| @radix-ui/react-checkbox | client, packages/ui | ^1.1.1 |
| @radix-ui/react-dialog | client, packages/ui | ^1.1.2 |
| @radix-ui/react-dropdown-menu | client, packages/ui | ^2.1.1 |
| @radix-ui/react-label | client, packages/ui | ^2.1.0 |
| @radix-ui/react-select | client, packages/ui | ^2.1.1 |
| @radix-ui/react-slot | client, packages/ui | ^1.1.0 |
| @radix-ui/react-tabs | client, packages/ui | ^1.1.0 |
| @radix-ui/react-toast | client, packages/ui | ^1.2.1 |
| @radix-ui/react-tooltip | client, packages/ui | ^1.1.4 |

### Shared dev tooling (≥2 workspaces)

| Package | Workspaces | Version used |
|---------|-----------|--------------|
| typescript | api-server, notification-server, client, logger, test-utils, ui, config-eslint | 5.8.2 / ^5.8.2 |
| eslint | api-server, notification-server, client, logger, test-utils, ui, config-eslint | ^9.22.0 |
| jest | api-server, notification-server, client, logger, test-utils, ui, jest-presets | ^29.7.0 |
| @jest/globals | api-server, notification-server, logger, test-utils, ui | ^29.7.0 |
| @types/node | api-server, notification-server, client, logger, test-utils, ui | ^22.13.9 / ^22.5.5 |
| @types/cors | api-server, notification-server | ^2.8.17 |
| @types/express | api-server, notification-server | 4.17.17 |
| @types/morgan | api-server, notification-server | ^1.9.9 |
| @types/supertest | api-server, notification-server | ^6.0.2 |
| @types/jest | api-server, notification-server, client | ^29.5.11 / ^29.5.12 |
| @types/axios | api-server, notification-server | ^0.9.36 |
| @types/jsonwebtoken | api-server, notification-server | ^9.0.9 |
| @types/mongoose | api-server, notification-server | ^5.11.96 |
| @types/react | client, packages/ui (peerDep) | ^18.3.18 |
| @types/react-dom | client, packages/ui (peerDep) | ^18.3.5 |
| supertest | api-server, notification-server | ^7.0.0 |
| tsup | api-server, notification-server | ^8.4.0 |
| ts-jest | api-server, notification-server, client, jest-presets | ^29.1.1 / ^29.2.6 |
| ts-node | api-server, notification-server | ^10.9.2 |
| prettier | api-server, notification-server, client (also root) | ^3.1.1 / ^3.5.3 |
| husky | api-server, notification-server (also root) | ^8.0.3 / ^9.0.7 |
| lint-staged | api-server, notification-server | ^15.2.0 |
| bunchee | logger, test-utils, ui | ^6.4.0 |
| typescript-eslint | client, config-eslint | ^8.0.1 / ^8.26.0 |
| @eslint/js | client, config-eslint | ^9.9.0 / ^9.22.0 |
| globals | client, config-eslint | ^15.9.0 / ^16.0.0 |

## Notes

- `dotenv` appears in multiple packages but should be removed per project policy (Doppler-only).
  Kept in drift report for visibility; catalog entry added for now.
- `react`/`react-dom` are peerDependencies in packages/ui — catalog reference still applies to
  the direct dependency in apps/client and satisfies the peer declaration.
- Version skew on `globals` (^15.9.0 vs ^16.0.0): catalog pins to ^16.0.0 (highest).
- Version skew on `prettier` (^3.1.1 vs ^3.5.3): catalog pins to ^3.5.3 (matches root).
- Version skew on `husky` (^8.0.3 vs ^9.0.7): catalog pins to ^9.0.7 (matches root).
- Version skew on `typescript` (5.8.2 exact vs ^5.8.2): catalog pins to 5.8.2 exact for stability.
