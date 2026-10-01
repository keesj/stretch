import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StretchAnimation } from "../StretchAnimation";
import type { Stretch } from "../../types/stretch";

function mk(overrides: Partial<Stretch>): Stretch {
  return {
    id: "test",
    title: "Test Stretch",
    duration: 30,
    instructions: [],
    bodyParts: [],
    difficulty: "easy",
    illustration: "🧘",
    ...overrides,
  };
}

describe("StretchAnimation", () => {
  it("renders nothing when the stretch has no animation", () => {
    const { container } = render(<StretchAnimation stretch={mk({})} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it.each([
    ["ankle-circles", "left"],
    ["seated-shin", "right"],
    ["wall-calf", "left"],
    ["soleus", "right"],
    ["lunge", "left"],
  ] as const)("renders the %s animation with a %s badge", (animation, side) => {
    const { container } = render(
      <StretchAnimation stretch={mk({ animation, side, title: `${animation} (${side})` })} />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText(side === "left" ? "L" : "R")).toBeInTheDocument();
  });

  it.each([
    "upward-salute",
    "toe-touch",
    "upward-dog",
    "childs-pose",
    "downward-dog",
    "wide-leg-bend",
  ] as const)("renders the %s animation", (animation) => {
    const { container } = render(<StretchAnimation stretch={mk({ animation, title: animation })} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
