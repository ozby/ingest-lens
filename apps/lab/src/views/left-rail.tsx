/** @jsxImportSource hono/jsx */

interface Scenario {
  id: string;
  label: string;
  href: string;
}

const SCENARIOS: Scenario[] = [
  { id: "s1a", label: "S1a — Correctness", href: "/lab/s1a-correctness" },
  { id: "s1b", label: "S1b — Latency", href: "/lab/s1b-latency" },
];

interface LeftRailProps {
  activeScenarioId?: string;
}

export function LeftRail({ activeScenarioId }: LeftRailProps) {
  return (
    <nav class="lab-left-rail" aria-label="Scenarios">
      <ul class="lab-left-rail__list" role="list">
        {SCENARIOS.map((s) => (
          <li key={s.id} class="lab-left-rail__item">
            <a
              href={s.href}
              class={`lab-left-rail__link${activeScenarioId === s.id ? " lab-left-rail__link--active" : ""}`}
              aria-current={activeScenarioId === s.id ? "page" : undefined}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
