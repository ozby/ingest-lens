/** @jsxImportSource hono/jsx */

interface EmptyStateProps {
  scenarioLabel: string;
}

export function EmptyState({ scenarioLabel }: EmptyStateProps) {
  return (
    <div class="lab-empty-state" role="status" aria-live="polite">
      <p class="lab-empty-state__text">
        No runs recorded yet for <strong>{scenarioLabel}</strong>.
      </p>
      <p class="lab-empty-state__cta">
        Click <strong>Run</strong> to start the first run.
      </p>
    </div>
  );
}
