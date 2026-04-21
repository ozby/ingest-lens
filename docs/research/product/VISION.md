---
type: research
last_updated: "2026-04-21"
---

# node-pubsub Vision

This repo is a **portfolio-grade event delivery platform** authored to
demonstrate principal-level engineering across runtime, infra, AI, and
guardrail discipline. It is not a product aimed at end users. Its
audience is a hiring engineering leader evaluating **how a 25-year-senior
engineer thinks, structures work, and ships**.

## What node-pubsub Is

Two layers sit on top of each other in this repo:

1. **The enabling layer — a reliability-first event delivery platform.**
   Hono control plane (`apps/api-server`), signed delivery receiver
   (`apps/notification-server`), Drizzle/Postgres durable model
   (`packages/db`), operator dashboard (`apps/client`). Tracks event
   acceptance, signed delivery, retries, replay, and operator
   observability.
2. **The showcase layer — blueprint-driven execution of an ambitious
   modernization plan.** Every non-trivial change is authored as a
   fact-checked blueprint, refined against repo reality, then executed
   through measurable gates (type safety, mutation score, commit hooks,
   CI). The _process_ is the product here.

Long term, the same stack is a credible seed for a unified-API-style
integration platform — signed deliveries, webhooks, idempotency,
observability, and an AI-assisted payload mapper that fits a B2B2B shape.

## The Problem

Most portfolio repos signal one of three things:

### 1. Can write code

A CRUD app, some tests, shipped to a preview URL. Shows ability to
produce, not to reason.

### 2. Can follow a tutorial

A stack pulled from a trending template: Next.js + Drizzle + shadcn.
Indistinguishable from a thousand other repos.

### 3. Can operate at scale

Microservices, Kubernetes, traces, dashboards — but no opinion about
why any of it exists or what invariants it preserves.

This repo refuses all three. It demonstrates **engineering judgment**:
blueprints before code; fact-checks before claims; guardrails before
features; honesty about truth state (shipped vs partial vs aspirational).

## Why Now

The moment makes several things cheap that used to be expensive:

- **AI-assisted implementation** lets a single engineer ship what a team used to. The bottleneck becomes _what to ship and how to verify it_, not keystrokes — so the planning and verification surfaces are what a senior engineer must excel at.
- **Vite Plus, tsgo, Bun, oxlint, Stryker 9** converge a formerly fragmented toolchain into one fast, honest surface. A 2026 repo that still uses 2024-era tooling is a tell.
- **Cloudflare + Pulumi + Doppler** gives a single engineer production-shaped infrastructure without a devops team.
- **Mutation testing** is finally fast enough to be a CI gate, not a weekly chore. Weak tests are now findable.

A repo built in 2026 should look like a 2026 repo.

## The Core Loop

The lifecycle a change follows in this repo:

1. `$plan <slug>` writes a durable blueprint under `blueprints/planned/`.
2. `$plan-refine <slug>` hardens it against current repo facts.
3. Execution produces commits that carry **Lore trailers** when they encode a decision.
4. Pre-commit hooks fail fast on style; pre-push runs `tsgo` typecheck and `oxlint`.
5. CI gates on types, lint, test, blueprint validation, catalog drift, mutation score, docs lint, and security scans.
6. Merge moves the blueprint to `completed/` with a referenceable commit.

Every step produces artifacts a reviewer can read independently.

## What We Are Building First

**Stage 1 — the guardrail skeleton.**

- `.agent/rules` + `.agent/guides` + `docs/` taxonomy + blueprint lifecycle are the operating contract.
- Commit hooks, blueprint validator, docs frontmatter check are wired.
- tsgo replaces tsc. Bun executes scripts. Doppler replaces dotenv.

**Stage 2 — the migration wave.**

The ten planned blueprints, in roughly this order:

1. `pnpm-catalogs-adoption` (expand catalog coverage — catalog already partially adopted)
2. `vite-plus-migration` (replace Turbo with `vp`; blocked on 1)
3. `commit-hooks-guardrails` (lint-staged + commitlint + secretlint — minimal hooks already live)
4. `stryker-mutation-guardrails` (pilot → fan out → CI gate)
5. `doppler-secrets` (wiring only — dotenv already removed)
6. `cloudflare-pulumi-infra` (account resources first; Worker runtime target to be decided)
7. `ci-hardening` (required checks + preview deploys + security scans)
8. `agents-md-principal-rewrite` (principal-layer operating contract)
9. `adr-lore-commit-protocol` (decision records + trailer vocabulary)
10. `integration-payload-mapper-dataset` (AI capstone — dataset + eval pack first; runtime later)

**Stage 3 — the AI capstone.**

A suggestion-only LLM payload mapper that fits a unified-API integration
platform. Ships dataset, gold tasks, evaluation contract, and an
executable harness. Never autonomous; confidence-aware; abstains when
ambiguous.

## The Role of the Event Delivery Platform

The event delivery platform is real infrastructure, not a demo. It:

- accepts events through a signed interface
- persists state in a Drizzle/Postgres model with honest in-memory fallbacks where the durable path has not yet landed
- delivers to downstream consumers with retries and replay
- tracks delivery state visibly enough to debug a failure

But it is **not the headline**. The headline is the engineering discipline
the repo demonstrates across the delivery platform, the migration wave,
and the AI capstone.

## What We Are Not

- A production SaaS looking for customers.
- A full reimplementation of a unified-API vendor's product. The integration-mapper blueprint is clearly scoped as _suggestion-only_.
- A complete Kubernetes/service-mesh showpiece. We pick Cloudflare + Pulumi precisely because a single engineer can own it.
- A Next.js + generic-template repo.

## Trust And Control

Every claim in this repo is labeled by truth state:

- **shipped** — executes today on `main`
- **partial** — architecture is defined; some execution paths are still in-memory or mocked
- **aspirational** — planned in a blueprint; not yet executable

A reviewer can scan any doc and know which category it belongs to. Drift
between label and reality is the single biggest failure mode of showcase
repos; the `plan-audit-checklist.md` guide exists to prevent it.

## Internal Validation Levels

A change graduates through these gates before landing on `main`:

| Level | Gate                                                                                            | Target                 |
| ----- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| L0    | Pre-commit: `blueprint:validate`, `docs:check`, staged oxlint/prettier                          | ≤ 3 s P95              |
| L1    | Commit-msg: conventional-commit + optional Lore trailers                                        | passes                 |
| L2    | Pre-push: `tsgo --noEmit` + full `oxlint`                                                       | passes                 |
| L3    | CI: lint + check-types + test + blueprint + catalog-drift + docs + mutation-affected + security | required status checks |
| L4    | Merge to `main` → blueprint moves to `completed/`, release workflow produces SBOM + provenance  | tagged                 |

A change that cannot clear all five does not ship.

## Why This Can Win (as a portfolio)

- The blueprint lifecycle is rare outside large engineering orgs; showing it in a personal repo signals senior-org instincts.
- Fact-checked findings with cited evidence demonstrate the single most under-valued senior skill: skepticism about your own assumptions.
- Runtime + infra + AI + guardrails in one coherent repo — with honest truth labels — is what a 25-year-senior repo should look like in 2026.
- The reviewer can pick any file and see the same rigor: frontmatter, citations, acceptance criteria, non-goals.

## Product Focus Now, Expansion Later

### Now

- Execute the ten planned blueprints in sequence.
- Keep the event delivery platform's truth state honest.
- Ship the AI capstone dataset + eval pack.

### Later

- Port runtime to Cloudflare Workers (if the cloudflare-pulumi-infra Q&A lands on "Workers").
- Add a second AI surface (delivery-failure triage agent).
- Wire a public demo dashboard.

That future path matters, but it should not blur the first wave.
