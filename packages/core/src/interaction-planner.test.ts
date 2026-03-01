import { describe, it, expect } from "vitest";
import {
  extractInteractiveElements,
  generateInteractionPlan,
} from "./interaction-planner.js";
import type { InferredRoute } from "./route-inferrer.js";

const makeDiff = (file: string, addedLines: string[]): string => {
  const lines = addedLines.map((l) => `+${l}`).join("\n");
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +1,${String(addedLines.length)} @@\n${lines}\n`;
};

describe("extractInteractiveElements", () => {
  it("extracts button elements from diff", () => {
    const diff = makeDiff("src/components/Form.tsx", [
      ' <button onClick={handleSubmit}>Submit</button>',
    ]);
    const elements = extractInteractiveElements(diff);
    expect(elements.length).toBeGreaterThan(0);
    const btn = elements.find((e) => e.type === "click");
    expect(btn).toBeDefined();
  });

  it("extracts input elements", () => {
    const diff = makeDiff("src/components/Login.tsx", [
      ' <input type="email" placeholder="Email" />',
    ]);
    const elements = extractInteractiveElements(diff);
    expect(elements.length).toBeGreaterThan(0);
    const input = elements.find((e) => e.type === "type");
    expect(input).toBeDefined();
  });

  it("extracts form elements with onSubmit", () => {
    const diff = makeDiff("src/components/Contact.tsx", [
      " <form onSubmit={handleSubmit}>",
    ]);
    const elements = extractInteractiveElements(diff);
    expect(elements.length).toBeGreaterThan(0);
  });

  it("handles empty diff", () => {
    const elements = extractInteractiveElements("");
    expect(elements).toHaveLength(0);
  });

  it("ignores non-interactive elements", () => {
    const diff = makeDiff("src/components/Display.tsx", [
      " <div className='container'>",
      "   <p>Hello world</p>",
      " </div>",
    ]);
    const elements = extractInteractiveElements(diff);
    expect(elements).toHaveLength(0);
  });

  it("extracts select elements", () => {
    const diff = makeDiff("src/components/Filter.tsx", [
      ' <select onChange={handleChange}>',
      '   <option value="a">A</option>',
      " </select>",
    ]);
    const elements = extractInteractiveElements(diff);
    const selectEl = elements.find((e) => e.type === "select");
    expect(selectEl).toBeDefined();
  });

  it("extracts elements with data-testid selectors", () => {
    const diff = makeDiff("src/components/Nav.tsx", [
      ' <button data-testid="nav-btn">Menu</button>',
    ]);
    const elements = extractInteractiveElements(diff);
    expect(elements.length).toBeGreaterThan(0);
    const btn = elements.find((e) => e.selector.includes("nav-btn"));
    expect(btn).toBeDefined();
  });

  it("includes source file information", () => {
    const diff = makeDiff("src/components/Panel.tsx", [
      " <button>Click</button>",
    ]);
    const elements = extractInteractiveElements(diff);
    expect(elements.length).toBeGreaterThan(0);
    expect(elements[0]?.sourceFile).toBe("src/components/Panel.tsx");
  });
});

describe("generateInteractionPlan", () => {
  it("generates a plan from diff and routes", () => {
    const diff = makeDiff("src/components/Form.tsx", [
      ' <button onClick={handleSubmit}>Submit</button>',
    ]);
    const routes: InferredRoute[] = [
      { route: "/form", source: "app/form/page.tsx", confidence: "high", reason: "page" },
    ];
    const plan = generateInteractionPlan(diff, routes);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("returns empty steps for empty diff", () => {
    const plan = generateInteractionPlan("", []);
    expect(plan.steps).toHaveLength(0);
  });

  it("includes summary and elementsFound", () => {
    const diff = makeDiff("src/components/App.tsx", [
      ' <input type="text" id="name" />',
    ]);
    const routes: InferredRoute[] = [
      { route: "/", source: "app/page.tsx", confidence: "high", reason: "root" },
    ];
    const plan = generateInteractionPlan(diff, routes);
    expect(plan.summary).toBeDefined();
    expect(plan.elementsFound).toBeGreaterThanOrEqual(0);
  });

  it("covers routes from elements", () => {
    const diff = makeDiff("app/dashboard/page.tsx", [
      " <button>Save</button>",
    ]);
    const routes: InferredRoute[] = [
      { route: "/dashboard", source: "app/dashboard/page.tsx", confidence: "high", reason: "page" },
    ];
    const plan = generateInteractionPlan(diff, routes);
    if (plan.steps.length > 0) {
      expect(plan.routesCovered).toContain("/dashboard");
    }
  });
});
