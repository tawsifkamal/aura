import type { ChangedFile } from "./diff-analyzer.js";
import type { Framework } from "./web-app-detector.js";

export interface InferredRoute {
  route: string;
  source: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

function normalizeSegment(segment: string): string {
  // Next.js/Remix dynamic routes: [id] -> :id, [slug] -> :slug
  const dynamicMatch = segment.match(/^\[(.+)\]$/);
  if (dynamicMatch?.[1]) return `:${dynamicMatch[1]}`;

  // SvelteKit dynamic routes: [id] -> :id
  const svelteMatch = segment.match(/^\[(.+)\]$/);
  if (svelteMatch?.[1]) return `:${svelteMatch[1]}`;

  return segment;
}

function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function inferNextJsRoute(filePath: string): InferredRoute | null {
  // app/ directory (App Router)
  const appMatch = filePath.match(/app\/(.+?)\/page\.[tj]sx?$/);
  if (appMatch?.[1]) {
    const segments = appMatch[1].split("/").map(normalizeSegment);
    return {
      route: "/" + segments.join("/"),
      source: filePath,
      confidence: "high",
      reason: "Next.js App Router page",
    };
  }

  // app/page.tsx (root)
  if (/app\/page\.[tj]sx?$/.test(filePath)) {
    return {
      route: "/",
      source: filePath,
      confidence: "high",
      reason: "Next.js App Router root page",
    };
  }

  // pages/ directory (Pages Router)
  const pagesMatch = filePath.match(/pages\/(.+?)\.[tj]sx?$/);
  if (pagesMatch?.[1]) {
    const name = pagesMatch[1];
    if (name === "index") {
      return {
        route: "/",
        source: filePath,
        confidence: "high",
        reason: "Next.js Pages Router index",
      };
    }
    if (name === "_app" || name === "_document") return null;
    const segments = name.split("/").map(normalizeSegment);
    return {
      route: "/" + segments.join("/"),
      source: filePath,
      confidence: "high",
      reason: "Next.js Pages Router page",
    };
  }

  // Layout or component in app/ directory
  if (/app\//.test(filePath) && /\.[tj]sx?$/.test(filePath)) {
    const dirMatch = filePath.match(/app\/(.+?)\//);
    if (dirMatch?.[1]) {
      const segments = dirMatch[1].split("/").map(normalizeSegment);
      return {
        route: "/" + segments.join("/"),
        source: filePath,
        confidence: "medium",
        reason: "Component in Next.js App Router directory",
      };
    }
  }

  return null;
}

function inferGenericRoute(filePath: string): InferredRoute | null {
  // pages/X or views/X pattern
  const pagesMatch = filePath.match(/(?:pages|views)\/(.+?)\.[tj]sx?$/);
  if (pagesMatch?.[1]) {
    const name = stripFileExtension(pagesMatch[1]);
    if (name === "index") {
      return {
        route: "/",
        source: filePath,
        confidence: "medium",
        reason: "Index page file",
      };
    }
    const segments = name.split("/").map(normalizeSegment);
    return {
      route: "/" + segments.join("/"),
      source: filePath,
      confidence: "medium",
      reason: "File in pages/views directory",
    };
  }

  // src/routes/X pattern
  const routesMatch = filePath.match(/src\/routes\/(.+?)\.[tj]sx?$/);
  if (routesMatch?.[1]) {
    const name = stripFileExtension(routesMatch[1]);
    const segments = name.split("/").map(normalizeSegment);
    return {
      route: "/" + segments.join("/"),
      source: filePath,
      confidence: "medium",
      reason: "File in routes directory",
    };
  }

  return null;
}

function inferFromComponents(filePath: string): InferredRoute | null {
  // Components don't map directly to routes, but we can guess based on naming
  const componentMatch = filePath.match(
    /components\/(.+?)\.[tj]sx?$/
  );
  if (componentMatch?.[1]) {
    const name = stripFileExtension(componentMatch[1]).toLowerCase();
    // Common page-level component names
    const pageNames = [
      "home",
      "dashboard",
      "settings",
      "profile",
      "login",
      "signup",
      "about",
      "contact",
    ];
    const baseName = name.split("/").pop() ?? "";
    if (pageNames.includes(baseName)) {
      return {
        route: "/" + baseName,
        source: filePath,
        confidence: "low",
        reason: "Component name suggests a route",
      };
    }
  }
  return null;
}

export function inferRoutes(
  changedFiles: ChangedFile[],
  framework: Framework
): InferredRoute[] {
  const routes: InferredRoute[] = [];
  const seenRoutes = new Set<string>();

  for (const file of changedFiles) {
    if (file.status === "deleted") continue;

    let inferred: InferredRoute | null = null;

    if (framework === "nextjs") {
      inferred = inferNextJsRoute(file.path);
    }

    if (!inferred) {
      inferred = inferGenericRoute(file.path);
    }

    if (!inferred) {
      inferred = inferFromComponents(file.path);
    }

    if (inferred && !seenRoutes.has(inferred.route)) {
      seenRoutes.add(inferred.route);
      routes.push(inferred);
    }
  }

  // Sort by confidence: high > medium > low
  const order = { high: 0, medium: 1, low: 2 };
  routes.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return routes;
}

export function buildNavigationPlan(
  routes: InferredRoute[],
  baseUrl: string
): string[] {
  return routes.map((r) => {
    const url = new URL(r.route, baseUrl).toString();
    return url;
  });
}
