---
type: research
title: "Sharing skills across AI-coding tools via a common symlinker (agent-kit model, 2026-04)"
subject: "Cross-tool skill/command/prompt sharing with @webpresso/agent-kit vs the 2026 ecosystem"
date: 2026-04-23
last_updated: "2026-04-23"
revised: 2026-04-23
confidence: medium-high
verdict: trial
---

> **Revision note (2026-04-23, same day)**: original draft had Codex project skills at `.codex/skills/`, repeating an error from the third-party `asm` project's provider table. Fact-checking against OpenAI's own docs revealed **Codex actually reads `.agents/skills/`**, walking up from CWD to repo root. This revision corrects that throughout. Net effect: the correct design is simpler — two skill surfaces (`.claude/skills` directory-mode + `.agents/skills` per-skill mode) cover Claude + Codex + Amp + OpenCode-via-fallback. No `.codex/skills/`, no `.opencode/skills/` needed.

# Sharing skills across AI-coding tools via a common symlinker (agent-kit model, 2026-04)

> agent-kit's symlinker-to-native-conventions model is directionally right, but 2–3 of its concrete consumer mappings are already obsolete (Codex custom prompts), redundant (`.opencode/skills/` is covered by OpenCode's `.claude/skills/` fallback), or at risk of drift from a rapidly-consolidating ecosystem around the SKILL.md open standard + registry distribution.

## TL;DR

- **SKILL.md is an open standard as of Dec 2025** ([Mintlify announcement](https://www.mintlify.com/blog/skill-md)). Anthropic published it, OpenAI adopted it for Codex CLI + ChatGPT, OpenCode implemented it natively plus reads `.claude/skills/` and `.agents/skills/` as compatibility fallbacks.
- **Codex custom prompts (`.codex/prompts/*.md`) are deprecated** — [OpenAI's Codex docs](https://developers.openai.com/codex/custom-prompts) state this explicitly and push users to Codex skills. The `.codex/prompts` entry just added to agent-kit's `DEFAULT_CONSUMERS` is mapping to a sunset surface that was never project-scoped anyway.
- **Codex project skills live at `.agents/skills/`, NOT `.codex/skills/`** ([Codex Agent Skills docs, "Where to save skills"](https://developers.openai.com/codex/skills)). This is a convergent standard with Amp and an OpenCode fallback — one shared dir, three tools. The third-party `asm` project's provider table lists `.codex/skills/` and is simply wrong.
- **Several mature competitors exist already**: `asm` (18 providers, symlink-based, 222 stars — but their Codex path is incorrect), `skillshare` (symlink+copy, 1.6k stars), `skillkit` (40+ tools), Vercel's `skills` CLI + Skills.sh registry (launched Jan 2026). They solve the same problem with more breadth.
- **Convention divergence**: Cursor and Windsurf use `.cursor/rules/` and `.windsurf/rules/` for rules (always-applied, different semantics from skills), not a skills dir. agent-kit's current `.cursor/commands/` / `.windsurf/commands/` mappings remain valid for slash-commands, but the tools have no skills surface in the Claude/Codex/Amp/OpenCode sense.
- **Registries are emerging fast**: the npm package ecosystem took ~10 years to reach 350k packages; agent-skills ecosystem did it in ~2 months ([Chris Ayers post](https://chris-ayers.com/posts/agent-skills-plugins-marketplace/)). 13% of marketplace skills reportedly contain critical vulnerabilities — security scanning is now table stakes for any sync tool.
- **Verdict — trial, with course corrections**: keep the symlinker but (a) drop `.codex/prompts` (deprecated + home-only), (b) drop `.codex/skills` (Codex doesn't read there — `asm`'s provider table got this wrong), (c) drop `.opencode/skills` (redundant — OpenCode reads `.claude/skills/` and `.agents/skills/` as fallbacks), (d) add `.agents/skills/` as a per-skill consumer (covers Codex + Amp + OpenCode-fallback), (e) ship a Windows `--copy` fallback mode, (f) add import-time security scanning. Longer-term: consider reframing agent-kit as a "repo-local source of truth + optional publish to Skills.sh" layer rather than a hand-rolled multi-consumer symlinker.

## What This Is

`@webpresso/agent-kit`'s symlinker is a build step that, given a canonical `.agent/{commands,workflows,skills}/` tree in a repo, creates native surfaces for each supported AI-coding tool:

- Per-file markdown symlinks for Claude Code (`.claude/commands/*.md`, `.claude/skills/<name>/`), Cursor, Windsurf, OpenCode (`.opencode/commands/`), Codex (`.codex/prompts/*.md`), and per-skill symlinks for `.codex/skills/` and `.opencode/skills/`.
- TOML transformation for Gemini CLI (`.gemini/commands/*.toml`).
- Relative symlink targets (`../../.agent/...`) for portability across clones, worktrees, and machines.
- Two skill modes: **directory-mode** (single symlink of the whole `.agent/skills/` dir — used for Claude) and **per-skill mode** (one symlink per skill, to coexist with consumer-owned skills — used for Codex/OpenCode).

This research evaluates that model against the state of the ecosystem in April 2026.

## State of the Art (2026)

### The SKILL.md open standard

As of December 2025, SKILL.md is an open standard ([Mintlify's announcement, Jan 2026](https://www.mintlify.com/blog/skill-md)). The [Cloudflare RFC](https://github.com/cloudflare/skills), [agentskills.io proposal](https://agentskills.io), and [Vercel's skills CLI](https://vercel.com/blog/introducing-skills) converged on a shared format:

- Directory per skill, `SKILL.md` inside, YAML frontmatter (`name`, `description` required; `license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation` optional).
- Discovery via `/.well-known/skills/default/skill.md` at the base URL of docs sites (so any product can publish its own usage skill).
- The same skill file works across **20+ major coding agents** per Mintlify's count.

### Per-tool convention table (April 2026, corrected)

| Tool              | Project skills                                                                       | Personal / global                                                      | Slash-commands                                     | Notes / source                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code       | `.claude/skills/<name>/SKILL.md`                                                     | `~/.claude/skills/<name>/`                                             | `.claude/commands/*.md`                            | Live change detection; enterprise > personal > project > plugin precedence ([Claude Code docs](https://code.claude.com/docs/en/skills))                                                                                       |
| Codex CLI         | **`.agents/skills/<name>/SKILL.md`** (walks up CWD → repo root)                      | `~/.agents/skills/<name>/`, admin `/etc/codex/skills`                  | ~~`.codex/prompts/*.md` — deprecated + home-only~~ | Invoke `$name` (explicit) or implicit via `description` match. `asm`'s provider table lists `.codex/skills/` and is incorrect — source of truth is [Codex "Where to save skills"](https://developers.openai.com/codex/skills) |
| OpenCode          | `.opencode/skills/<name>/SKILL.md` + fallbacks: `.claude/skills/`, `.agents/skills/` | `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` | `.opencode/commands/*.md`                          | OpenCode explicitly reads Claude-compatible and agent-compatible paths ([OpenCode Agent Skills](https://opencode.ai/docs/skills/), [OpenCode Commands](https://opencode.ai/docs/commands/))                                   |
| Amp (Sourcegraph) | `.agents/skills/<name>/SKILL.md`                                                     | `~/.config/agents/skills/`, `~/.config/amp/skills/`                    | Amp's `skill:` command palette                     | Bundled MCP servers via `mcp.json` in skill dir; skill precedence: `~/.config/agents/` > `~/.config/amp/` > `.agents/` > `.claude/` > `~/.claude/` > plugins ([Amp manual](https://ampcode.com/manual))                       |
| Cursor            | no first-class skills surface — `.cursor/rules/*.mdc` is "rules" (always-applied)    | `~/.cursor/rules/`                                                     | `.cursor/commands/*.md`                            | "Rules" ≠ "skills" semantically; not the same discovery/invocation path                                                                                                                                                       |
| Windsurf          | no first-class skills surface — `.windsurf/rules/` is "rules"                        | `~/.windsurf/rules/`                                                   | `.windsurf/commands/*.md`                          | Same as Cursor                                                                                                                                                                                                                |
| Cline             | `.clinerules/` (rules, not skills)                                                   | `~/Documents/Cline/Rules/`                                             | —                                                  | Different convention entirely                                                                                                                                                                                                 |
| Gemini CLI        | `.gemini/skills/` (per `asm`; unverified from official docs)                         | `~/.gemini/skills/`                                                    | `.gemini/commands/*.toml`                          | TOML for commands, per-skill dir for skills (per asm, but the same source got Codex wrong — treat as unverified)                                                                                                              |

**Key observation**: `.agents/skills/` is the **convergent** project skills dir across Codex (official), Amp (official), and OpenCode (fallback). A symlinker that creates two surfaces — `.claude/skills` (for Claude + OpenCode fallback) and `.agents/skills/<name>` (for Codex + Amp + OpenCode fallback) — covers four major tools with zero per-tool special cases. No `.codex/skills/`, no `.opencode/skills/`.

### Codex prompts → skills migration

From [OpenAI's custom-prompts docs](https://developers.openai.com/codex/custom-prompts):

> Custom prompts are deprecated. Use [skills](/codex/skills) for reusable instructions that Codex can invoke explicitly or implicitly.
>
> Custom prompts (deprecated) let you turn Markdown files into reusable prompts that you can invoke as slash commands in both the Codex CLI and the Codex IDE extension. Custom prompts require explicit invocation and live in your local Codex home directory (for example, `~/.codex`), so they're not shared through your repository.

Two specific facts matter:

1. **Deprecated** → project-local `.codex/prompts/` is a dead-end surface.
2. **Home-directory only** → even before deprecation, Codex scanned only `~/.codex/prompts/`, never project `.codex/prompts/`. So agent-kit's `.codex/prompts/` symlinks were never going to be found by Codex anyway unless the user manually symlinked `~/.codex/prompts → <repo>/.codex/prompts` (which is fragile and global-state-y).

### Registry / marketplace emergence

- **Skills.sh** — launched by Vercel on January 20, 2026 as the official directory and leaderboard for 19 AI agents including Claude Code, Cursor, Codex, GitHub Copilot, Windsurf, Gemini ([Skills.sh guide](https://virtualuncle.com/agent-skills-marketplace-skills-sh-2026/)).
- **`npx skills`** — Vercel's CLI, installs skills from Skills.sh or arbitrary URLs ([npm skills package](https://www.npmjs.com/package/skills)).
- **asm-registry** — the `asm` project's own registry, curated + security-scanned ([luongnv89/asm](https://github.com/luongnv89/asm)).
- **agent-skills (tech-leads-club)** — "secure, validated skill registry" framing; explicitly positions itself against insecure marketplaces ([github.com/tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills)).
- **SkillsMP** — third-party marketplace for Claude/Codex/ChatGPT skills.

The ecosystem is moving very fast: "npm took a decade to reach 350,000 packages. The AI agent skills ecosystem did it in about two months" ([Chris Ayers, Agent Skills: The Complete Guide](https://chris-ayers.com/posts/agent-skills-plugins-marketplace/)).

### Competing sync tools

| Tool                                                                         | Stars (as of fetch) | Mode                                    | Providers        | Distinctive feature                                                                                              |
| ---------------------------------------------------------------------------- | ------------------- | --------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| [skillshare](https://github.com/runkids/skillshare) (runkids)                | 1.6k                | symlink **+ copy fallback per-target**  | 50+              | Explicit `--mode copy` switch per target when symlinks break; web dashboard; agents + extras + rules in one tool |
| [asm](https://github.com/luongnv89/asm) (agent-skill-manager)                | 222                 | symlink-based (`asm link` for live dev) | 18 built-in      | Built-in security scanning; audit for duplicates; ASM Registry; TUI + CLI                                        |
| [skillkit](https://github.com/rohitg00/skillkit)                             | —                   | symlink/copy                            | 40+              | "Install, translate & share skills across Claude Code, Cursor, Codex, Copilot & 40 more"                         |
| [agent-skill-creator](https://github.com/FrancyJGLisboa/agent-skill-creator) | —                   | —                                       | 14+              | Scaffolds skills that install on multiple tools                                                                  |
| [Vercel skills CLI](https://www.npmjs.com/package/skills)                    | —                   | copy                                    | 19 via Skills.sh | Official Vercel/npm surface; auto-discovery via `/.well-known/skills`                                            |

agent-kit's symlinker is narrower (5–6 surfaces) but tighter-integrated with the broader Blueprint runtime / `ak init` lifecycle.

## Positive Signals

### Canonical-source model is the right pattern

- The principle "one `.agent/` source, N native surfaces derived" matches exactly what `asm`, `skillshare`, and `skillkit` have converged on — all symlink or copy from a source-of-truth directory into per-tool directories. agent-kit isn't inventing a new shape; it's implementing a well-understood one ([asm provider table](https://github.com/luongnv89/asm), [skillshare quickstart](https://github.com/runkids/skillshare)).
- OpenCode validated the pattern natively by reading `.claude/skills/` and `.agents/skills/` as fallback locations ([OpenCode docs](https://opencode.ai/docs/skills/)). This means a `.agent/skills/` canonical dir gets picked up by OpenCode "for free" if symlinked to `.claude/skills/` or `.agents/skills/`.

### Relative symlink targets are durable

- Per [Claude Code's "live change detection" feature](https://code.claude.com/docs/en/skills), Claude watches skill directories for file changes and picks up edits within the current session — symlinks work transparently because edits go through to `.agent/`.
- Amp's precedence ordering (`~/.config/agents/` > `.agents/` > `.claude/`) specifically expects multiple-directory coexistence, which is what per-skill symlinks preserve.

### Blueprint runtime integration is distinctive

- None of the competing tools (asm, skillshare, skillkit) integrate with a blueprint/implementation-plan lifecycle. agent-kit ships Blueprint validator, DAG executor, `ak blueprint refine`, and a symlinker in one package. The sync layer is a piece of a bigger story.
- The `ak init` → `ak symlink sync` flow is coherent for a single-repo adopter whose goal is agent-driven development, not skill distribution.

### MIT-licensable SKILL.md spec

- Since Anthropic open-standardized SKILL.md and OpenAI adopted it, any skill an agent-kit user writes is automatically portable to Skills.sh, asm-registry, and every competing tool. No lock-in.

## Negative Signals

### Codex prompts mapping is deprecated-surface

- The `.codex/prompts/` entry I just added to `DEFAULT_CONSUMERS` points at a sunsetting surface. Codex skills (`.codex/skills/`) is the forward path. Worse, Codex scans **only `~/.codex/prompts/`** (home), not project-local — so the symlinks at `.codex/prompts/*.md` in a repo were never going to be discovered ([Codex custom-prompts docs](https://developers.openai.com/codex/custom-prompts)):
  > Custom prompts require explicit invocation and live in your local Codex home directory (for example, `~/.codex`), so they're not shared through your repository.

### `.opencode/skills/` is redundant

- [OpenCode's Place files docs](https://opencode.ai/docs/skills/) explicitly list `.claude/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` as fallback project locations that OpenCode walks up to. Since agent-kit already creates `.claude/skills` (directory-symlink to `.agent/skills`), OpenCode picks up those skills without any `.opencode/skills/` entries at all. The per-skill symlinks we added to `.opencode/skills/` duplicate that discovery.

### Cursor/Windsurf `commands/` is not the skill surface

- asm's provider table lists Cursor's skill surface as `.cursor/rules/` and Windsurf's as `.windsurf/rules/`, not `.cursor/commands/` or `.windsurf/commands/`. "Rules" (applied always, low-ceremony) and "skills" (invoked, high-ceremony) are semantically different. agent-kit currently maps `.agent/skills/` to neither a `rules/` nor a skills dir for Cursor/Windsurf — meaning Cursor/Windsurf users don't actually see `.agent/skills/` content at all, only commands.

### No Windows `--copy` fallback

- Per [Git for Windows' symlink guidance](https://gitforwindows.org/symbolic-links.html) and the [Windows Git symlink fix article](https://sqlpey.com/git/fixing-git-symlink-issues-windows/), unprivileged users on Windows see `CreateSymbolicLinkW` fail silently and git writes text stubs with exit code 0. Developer Mode (Settings → Privacy & security → For developers) is required, and adoption is not universal.
- skillshare ships an explicit `--mode copy` per-target fallback for exactly this case ([skillshare highlights](https://github.com/runkids/skillshare)). agent-kit's `symlinker.md` notes a `--copy` mode is "planned" but not implemented — Windows users are effectively locked out.

### No security scanning on imported skills

- asm specifically calls out "13% of marketplace skills contain critical vulnerabilities" as a motivator for its built-in scanning. With registries like Skills.sh making it easier to pull skills from arbitrary sources, any sync tool that doesn't flag dangerous patterns (shell execution, network access, credential exposure, obfuscation) is pushing risk onto every user.
- agent-kit has no equivalent of `asm`'s security scan or skillshare's `audit` command.

### Consumer-list drift is fragile

- Every time a new tool launches (e.g., Hermes, Antigravity, Augment, Roo Code, Cline) and asm adds it as the 19th, 20th, 21st provider, agent-kit's DEFAULT_CONSUMERS has to manually catch up. asm's config model — a JSON provider list users can edit — scales better than hard-coded defaults.

### Directory-mode vs per-skill mode is a local trade-off, not a shared solution

- The distinction added in this change (directory-symlink for Claude, per-skill for Codex/OpenCode) works for this repo but doesn't survive contact with consumers who have their own needs. asm defaults to per-skill in every provider for exactly this reason — simpler mental model, zero collision surface.

## Community Sentiment

- **Developer reaction to SKILL.md standardization is overwhelmingly positive.** Direct quote from [unicodeveloper's Medium post (Mar 2026)](https://medium.com/@unicodeveloper/10-must-have-skills-for-claude-and-any-coding-agent-in-2026-b5451b013051): the universal SKILL.md format means "the same file that works in Claude Code installs directly in Cursor, Codex CLI, Gemini CLI, Antigravity (Google's AI IDE), and Windsurf."
- **Sync tools are proliferating because the need is acute.** Skillshare's 1.6k stars and rapid feature velocity (`sync agents`, `sync extras`, web dashboard in <6 months from inception) suggest people are actively looking for a one-command sync.
- **Security anxiety is real.** "In an ecosystem where over 13% of marketplace skills contain critical vulnerabilities" ([agent-skills/tech-leads-club](https://github.com/tech-leads-club/agent-skills) README) — this is the headline framing of the field's most safety-conscious registry. agent-kit adopters are walking into an environment where their users will expect audit tooling.
- **Windows symlinks remain a persistent pain point.** Every sync-tool project that mentions Windows mentions a copy-fallback ([skillshare](https://github.com/runkids/skillshare)) or WSL-only ([Amp](https://ampcode.com/manual)) workaround. "Without Developer Mode, `CreateSymbolicLinkW` silently fails and git writes text stubs anyway with exit code 0" ([sqlpey.com Git symlink article](https://sqlpey.com/git/fixing-git-symlink-issues-windows/)).

## Project Alignment

### Vision Fit

The node-pubsub repo's stated mission per `docs/research/product/VISION.md` is "portfolio-grade event delivery platform… audience is a hiring engineering leader evaluating how a 25-year-senior engineer thinks, structures work, and ships." The **showcase layer** — "every non-trivial change is authored as a fact-checked blueprint, refined against repo reality, then executed through measurable gates" — is where agent-kit lives.

Relevance to the vision:

- **Positive signal**: showing that a repo cleanly publishes skills across 6+ AI-tool surfaces from a single canonical source is a strong artifact of meta-infrastructure thinking. It's exactly the kind of thing a hiring leader scans for in the "AI discipline" bucket.
- **Risk**: if the mappings we just added are demonstrably wrong (deprecated Codex prompts, redundant opencode/skills, missing cursor/windsurf rules/, no Windows copy mode, no security scan), the artifact reads as "built a thing and didn't notice the ecosystem moved" — the opposite of principal-level signal.

The fix is to correct the mappings — doing so earns back the signal.

### Tech Stack Fit

agent-kit is a pnpm-workspace-installed TypeScript package; the symlinker is a pure-Node script with no runtime deps. Fits the project's `tsgo` + Bun + pnpm + Cloudflare Workers stack cleanly. No conflicts.

Competing tools:

- **asm** — Node/npm CLI. Integrates similarly; would replace agent-kit's symlinker portion, not its Blueprint portion.
- **skillshare** — Go binary. Cleanly separate from JS toolchain; would need a separate install step.
- **Vercel skills CLI (`npx skills`)** — npm. Cleanest fit but narrowly scoped to registry-based install, doesn't handle multi-tool per-repo sync.

### Trade-offs for Current Stage

The node-pubsub repo is early-mid in its modernization plan. Cost/benefit right now:

- **Low cost**: correct the 3 wrong mappings (drop `.codex/prompts`, drop `.opencode/skills`, add `.cursor/rules`/`.windsurf/rules` if aiming for completeness). ~1 hour of edits + rebuild.
- **Medium cost**: implement Windows `--copy` mode. ~1 day given the current codebase shape.
- **Higher cost**: security scanning, registry publish/pull, convergence with Skills.sh. Multi-day and arguably outside node-pubsub's scope — would belong in the upstream agent-kit repo.

## Recommendation

**Verdict: trial (with course corrections).** The symlinker pattern is right; specific mappings are wrong or redundant; the long-term direction needs thought.

### Immediate corrections (do now)

1. **Drop `.codex/prompts` from `DEFAULT_CONSUMERS`.** Codex custom prompts are deprecated and only discovered in `~/.codex/prompts/`, never project-local ([Codex docs](https://developers.openai.com/codex/custom-prompts)). The entry is wrong on both axes.
2. **Drop `.codex/skills` from `DEFAULT_PER_SKILL_CONSUMERS`.** Codex's actual project-skills path is `.agents/skills/` per OpenAI's own docs ([Codex "Where to save skills"](https://developers.openai.com/codex/skills)). The `asm` project's provider table — which I used as a secondary source in the original draft — lists `.codex/skills/` and is incorrect. Codex will never read there.
3. **Drop `.opencode/skills` from `DEFAULT_PER_SKILL_CONSUMERS`.** OpenCode already discovers `.claude/skills/<name>/` and `.agents/skills/<name>/` as fallback project locations ([OpenCode docs](https://opencode.ai/docs/skills/)). The per-skill symlinks are redundant noise.
4. **Add `.agents/skills/` as a per-skill consumer.** This single entry covers Codex (official project path), Amp (official project path), and OpenCode (fallback path) in one move.
5. **Don't touch `.cursor/rules/` / `.windsurf/rules/` yet.** Those conventions use "rules" semantically (always-apply), which doesn't map cleanly to skills (model-invoked). Needs a design call about whether agent-kit skills become Cursor/Windsurf rules or not.

### Short-term (weeks)

5. **Implement the Windows `--copy` mode** that symlinker.md already flags as "planned." Skillshare's per-target `--mode copy` is a good reference pattern.
6. **Add `ak skills audit` for imported skills.** Flag shell execution, network access, credential exposure, obfuscation. asm's scanner is a reference implementation.

### Longer-term (next quarter+)

7. **Decide agent-kit's relationship with Skills.sh / `npx skills`.** Two paths:
   - **Complementary**: agent-kit remains repo-local canonical source → native surfaces. Users import shared skills via `npx skills add <url>` into `.agent/skills/`, then `ak symlink sync` derives the per-tool surfaces.
   - **Subsumed**: if Vercel's `skills` CLI matures to cover multi-surface sync + Blueprint integration, agent-kit's symlinker niche shrinks. Watch closely.

### Conditions that would change the recommendation

- If Vercel's `skills` CLI or asm adds first-class Blueprint-runtime integration → reconsider keeping a parallel symlinker in agent-kit at all.
- If Anthropic or OpenAI ship an official canonical-source → multi-surface sync → the entire symlinker becomes obsolete.
- If SKILL.md drifts from open standard back to per-vendor dialects → the canonical-source model breaks down and per-target transforms (not symlinks) become mandatory.

## Sources

1. [OpenCode Agent Skills docs](https://opencode.ai/docs/skills/) — official docs, high credibility, positive (confirms SKILL.md + cross-tool compat)
2. [Claude Code Skills docs](https://code.claude.com/docs/en/skills) — official docs, high credibility, positive (project/personal/enterprise hierarchy, live reload)
3. [Codex Agent Skills docs](https://developers.openai.com/codex/skills) — official docs, high credibility, positive (Anthropic spec adoption, `$name` invocation)
4. [Codex Custom Prompts docs (deprecated)](https://developers.openai.com/codex/custom-prompts) — official docs, high credibility, decisive (`.codex/prompts/` is deprecated + home-only)
5. [Mintlify: skill.md as open standard (Jan 2026)](https://www.mintlify.com/blog/skill-md) — vendor blog (flag bias) but cites Cloudflare RFC + Vercel CLI, medium-high credibility, positive
6. [Amp (Sourcegraph) Owner's Manual](https://ampcode.com/manual) — vendor docs, high credibility, neutral (documents `.agents/skills/` + MCP bundling)
7. [asm: agent-skill-manager GitHub](https://github.com/luongnv89/asm) — open-source tool, high credibility on provider conventions, positive-neutral (reference implementation for 18-provider sync)
8. [skillshare GitHub](https://github.com/runkids/skillshare) — open-source tool, high credibility, positive (symlink + copy fallback pattern)
9. [Unicodeveloper: 10 Must-Have Skills for Claude and Any Coding Agent in 2026](https://medium.com/@unicodeveloper/10-must-have-skills-for-claude-and-any-coding-agent-in-2026-b5451b013051) — engineering blog, medium credibility, positive (confirms cross-tool portability)
10. [Chris Ayers: Agent Skills, Plugins and Marketplace](https://chris-ayers.com/posts/agent-skills-plugins-marketplace/) — engineering blog, medium credibility, neutral (ecosystem growth stats)
11. [Skills.sh Guide (2026)](https://virtualuncle.com/agent-skills-marketplace-skills-sh-2026/) — community guide, medium credibility, positive (registry launch context)
12. [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) — open-source registry, medium credibility, critical (13% critical-vuln stat)
13. [Git for Windows: Symbolic Links](https://gitforwindows.org/symbolic-links.html) — project docs, high credibility, critical (Windows symlink gotchas)
14. [Fixing Git Symlink Issues on Windows](https://sqlpey.com/git/fixing-git-symlink-issues-windows/) — engineering blog, medium credibility, critical (silent-failure pattern without Developer Mode)
15. [Vercel skills npm package](https://www.npmjs.com/package/skills) — package registry, high credibility on CLI behavior, neutral (registry-pull model)
16. [SkillKit GitHub](https://github.com/rohitg00/skillkit) — open-source tool, high credibility, neutral (40+ tool breadth comparison)
