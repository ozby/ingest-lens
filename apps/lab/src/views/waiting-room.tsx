/** @jsxImportSource hono/jsx */

interface WaitingRoomProps {
  position: number;
  queueLength: number;
  etaMs: number;
}

export function WaitingRoom({ position, queueLength, etaMs }: WaitingRoomProps) {
  const etaSec = Math.ceil(etaMs / 1000);
  return (
    <div class="lab-waiting-room" role="status" aria-live="polite">
      <h2 class="lab-waiting-room__title">Run in progress</h2>
      <p class="lab-waiting-room__body">
        Another session is currently running. You are position <strong>{position}</strong> of{" "}
        <strong>{queueLength}</strong> in the queue.
      </p>
      <p class="lab-waiting-room__eta">Estimated wait: ~{etaSec}s</p>
      <p class="lab-waiting-room__hint">
        This page will refresh automatically when your session starts.
      </p>
    </div>
  );
}
