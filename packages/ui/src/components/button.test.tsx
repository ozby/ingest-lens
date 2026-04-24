import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

function renderButton(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return { container, root };
}

describe("Button", () => {
  it("renders an accessible button and forwards click behavior", () => {
    const onClick = vi.fn();
    const { container, root } = renderButton(<Button onClick={onClick}>Create Queue</Button>);

    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Create Queue");

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    root.unmount();
    container.remove();
  });

  it("supports asChild so links keep button styling without losing link semantics", () => {
    const { container, root } = renderButton(
      <Button asChild>
        <a href="/queues">View Queues</a>
      </Button>,
    );

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/queues");
    expect(link?.textContent).toBe("View Queues");
    root.unmount();
    container.remove();
  });
});
