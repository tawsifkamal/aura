import { describe, it, expect } from "vitest";
import { inferRoutes, buildNavigationPlan } from "./route-inferrer.js";
import type { ChangedFile } from "./diff-analyzer.js";

function makeFile(
  path: string,
  status: "added" | "modified" | "deleted" = "added",
): ChangedFile {
  const isComponent = /components\//.test(path);
  const isPage = /pages\/|app\//.test(path);
  const isRoute = /page\.[tj]sx?$/.test(path);
  const ext = path.match(/\.[^.]+$/)?.[0] ?? "";
  return { path, status, isComponent, isPage, isRoute, extension: ext };
}

describe("inferRoutes", () => {
  it("infers Next.js App Router routes from page.tsx files", () => {
    const routes = inferRoutes(
      [makeFile("app/dashboard/page.tsx")],
      "nextjs",
    );
    expect(routes.length).toBeGreaterThan(0);
    const dashboardRoute = routes.find((r) => r.route.includes("dashboard"));
    expect(dashboardRoute).toBeDefined();
  });

  it("infers Next.js Pages Router routes", () => {
    const routes = inferRoutes(
      [makeFile("src/pages/about.tsx", "modified")],
      "nextjs",
    );
    expect(routes.length).toBeGreaterThan(0);
    const aboutRoute = routes.find((r) => r.route.includes("about"));
    expect(aboutRoute).toBeDefined();
  });

  it("handles index pages as root routes", () => {
    const routes = inferRoutes(
      [makeFile("app/page.tsx", "modified")],
      "nextjs",
    );
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]?.route).toBe("/");
  });

  it("assigns confidence levels", () => {
    const routes = inferRoutes(
      [
        makeFile("app/settings/page.tsx"),
        makeFile("src/components/Button.tsx", "modified"),
      ],
      "nextjs",
    );
    const pageRoute = routes.find((r) => r.route.includes("settings"));
    if (pageRoute) {
      expect(["high", "medium", "low"]).toContain(pageRoute.confidence);
    }
  });

  it("deduplicates routes", () => {
    const routes = inferRoutes(
      [
        makeFile("app/users/page.tsx", "modified"),
        makeFile("app/users/layout.tsx", "modified"),
      ],
      "nextjs",
    );
    const userRoutes = routes.filter((r) => r.route.includes("users"));
    const uniqueRoutes = new Set(userRoutes.map((r) => r.route));
    expect(uniqueRoutes.size).toBe(userRoutes.length);
  });

  it("returns empty array for non-route files", () => {
    const routes = inferRoutes(
      [
        makeFile("tsconfig.json", "modified"),
        makeFile("package.json", "modified"),
      ],
      "nextjs",
    );
    expect(routes).toHaveLength(0);
  });

  it("skips deleted files", () => {
    const routes = inferRoutes(
      [makeFile("app/old/page.tsx", "deleted")],
      "nextjs",
    );
    expect(routes).toHaveLength(0);
  });
});

describe("buildNavigationPlan", () => {
  it("builds navigation plan from inferred routes", () => {
    const routes = inferRoutes(
      [makeFile("app/dashboard/page.tsx")],
      "nextjs",
    );
    const plan = buildNavigationPlan(routes, "http://localhost:3000");
    expect(plan.length).toBeGreaterThan(0);
    if (plan[0]) {
      expect(plan[0]).toContain("http://localhost:3000");
    }
  });

  it("handles empty routes", () => {
    const plan = buildNavigationPlan([], "http://localhost:3000");
    expect(plan).toHaveLength(0);
  });
});
