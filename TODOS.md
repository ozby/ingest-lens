# TODOS

## Self-Healing Stream (adaptive intake)

### Document the 0.5-0.79 confidence band behavior

**What:** Add a comment in `aiMappingAdapter.ts` and the design doc explaining that confidence values between `LOW_CONFIDENCE_THRESHOLD` (0.5) and `AUTO_HEAL_THRESHOLD` (0.8) fall through to the human review path (`pending_review`). These are not abstained — `suggestMappings()` returns `kind: "success"` — but confidence is not high enough for auto-heal.
**Why:** The band behavior is correct but undocumented. Implementers will encounter confidence 0.6 results and wonder whether auto-heal should fire.
**Where to start:** `apps/workers/src/intake/aiMappingAdapter.ts` and `apps/workers/src/routes/intake.ts` (auto-heal branch condition).
**Effort:** XS — comment + design doc update only.
**Completed:** v0.0.0 (2026-04-26) — comment added to aiMappingAdapter.ts
