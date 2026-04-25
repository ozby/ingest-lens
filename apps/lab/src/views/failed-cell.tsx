/** @jsxImportSource hono/jsx */

interface FailedCellProps {
  reason: string;
}

export function FailedCell({ reason }: FailedCellProps) {
  return (
    <span class="lab-cell--failed" aria-label={`Failed: ${reason}`} title={reason}>
      ERR
    </span>
  );
}
