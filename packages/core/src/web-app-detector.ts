import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Framework =
  | "nextjs"
  | "react"
  | "vue"
  | "vite"
  | "angular"
  | "svelte"
  | "nuxt"
  | "remix"
  | "astro"
  | "unknown";

export interface WebAppInfo {
  isWebApp: boolean;
  framework: Framework;
  devScript: string | null;
  devPort: number | null;
  dependencies: Record<string, string>;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_DETECTORS: { dep: string; framework: Framework }[] = [
  { dep: "next", framework: "nextjs" },
  { dep: "nuxt", framework: "nuxt" },
  { dep: "@remix-run/react", framework: "remix" },
  { dep: "astro", framework: "astro" },
  { dep: "@sveltejs/kit", framework: "svelte" },
  { dep: "svelte", framework: "svelte" },
  { dep: "vue", framework: "vue" },
  { dep: "@angular/core", framework: "angular" },
  { dep: "vite", framework: "vite" },
  { dep: "react", framework: "react" },
];

const DEV_SCRIPT_NAMES = ["dev", "start", "serve", "develop"];

const DEFAULT_PORTS: Partial<Record<Framework, number>> = {
  nextjs: 3000,
  react: 3000,
  vue: 5173,
  vite: 5173,
  angular: 4200,
  svelte: 5173,
  nuxt: 3000,
  remix: 3000,
  astro: 4321,
};

function readPackageJson(projectDir: string): PackageJson | null {
  try {
    const raw = readFileSync(join(projectDir, "package.json"), "utf-8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function detectFramework(deps: Record<string, string>): Framework {
  for (const { dep, framework } of FRAMEWORK_DETECTORS) {
    if (dep in deps) {
      return framework;
    }
  }
  return "unknown";
}

function findDevScript(scripts: Record<string, string>): string | null {
  for (const name of DEV_SCRIPT_NAMES) {
    if (name in scripts) {
      return name;
    }
  }
  return null;
}

function extractPortFromScript(script: string): number | null {
  const portMatch = script.match(/(?:--port|--p|-p)\s+(\d+)/);
  if (portMatch?.[1]) return parseInt(portMatch[1], 10);

  const envMatch = script.match(/PORT=(\d+)/);
  if (envMatch?.[1]) return parseInt(envMatch[1], 10);

  return null;
}

function resolveDevPort(
  framework: Framework,
  scripts: Record<string, string>,
  devScript: string | null
): number | null {
  if (devScript && scripts[devScript]) {
    const scriptPort = extractPortFromScript(scripts[devScript]!);
    if (scriptPort) return scriptPort;
  }
  return DEFAULT_PORTS[framework] ?? null;
}

export function detectWebApp(projectDir: string): WebAppInfo {
  const pkg = readPackageJson(projectDir);

  if (!pkg) {
    return {
      isWebApp: false,
      framework: "unknown",
      devScript: null,
      devPort: null,
      dependencies: {},
    };
  }

  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const framework = detectFramework(allDeps);
  const scripts = pkg.scripts ?? {};
  const devScript = findDevScript(scripts);
  const isWebApp = framework !== "unknown";

  return {
    isWebApp,
    framework,
    devScript,
    devPort: isWebApp ? resolveDevPort(framework, scripts, devScript) : null,
    dependencies: allDeps,
  };
}
