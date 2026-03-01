import { execSync } from "node:child_process";

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  isComponent: boolean;
  isPage: boolean;
  isRoute: boolean;
  extension: string;
}

export interface DiffAnalysis {
  changedFiles: ChangedFile[];
  componentFiles: ChangedFile[];
  pageFiles: ChangedFile[];
  routeFiles: ChangedFile[];
  diff: string;
}

const COMPONENT_DIRS = ["components", "ui", "shared", "common", "features"];
const PAGE_DIRS = ["pages", "app", "views", "routes"];
const FRONTEND_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte"];
const ROUTE_FILE_PATTERNS = [
  /page\.[tj]sx?$/,
  /index\.[tj]sx?$/,
  /route\.[tj]sx?$/,
  /layout\.[tj]sx?$/,
  /\+page\.(svelte|ts)$/,
  /\[.*\]\.[tj]sx?$/,
];

function parseGitStatus(
  statusChar: string
): "added" | "modified" | "deleted" | "renamed" {
  switch (statusChar) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

function getExtension(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function isFrontendFile(filePath: string): boolean {
  const ext = getExtension(filePath);
  return FRONTEND_EXTENSIONS.includes(ext);
}

function isInDirectory(filePath: string, dirs: string[]): boolean {
  const parts = filePath.split("/");
  return parts.some((part) => dirs.includes(part));
}

function isComponentFile(filePath: string): boolean {
  if (!isFrontendFile(filePath)) return false;
  return isInDirectory(filePath, COMPONENT_DIRS);
}

function isPageFile(filePath: string): boolean {
  if (!isFrontendFile(filePath)) return false;
  return isInDirectory(filePath, PAGE_DIRS);
}

function isRouteFile(filePath: string): boolean {
  if (!isFrontendFile(filePath)) return false;
  return ROUTE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function classifyFile(path: string, status: string): ChangedFile {
  return {
    path,
    status: parseGitStatus(status),
    isComponent: isComponentFile(path),
    isPage: isPageFile(path),
    isRoute: isRouteFile(path),
    extension: getExtension(path),
  };
}

export function parseDiffNameStatus(output: string): ChangedFile[] {
  return output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0]?.charAt(0) ?? "M";
      const filePath = parts[parts.length - 1] ?? "";
      return classifyFile(filePath, status);
    });
}

export function getGitDiff(cwd?: string): string {
  const options = cwd ? { cwd, encoding: "utf-8" as const } : { encoding: "utf-8" as const };
  try {
    const staged = execSync("git diff --cached", options);
    const unstaged = execSync("git diff", options);
    return `${staged}\n${unstaged}`.trim();
  } catch {
    return "";
  }
}

export function getChangedFiles(cwd?: string): ChangedFile[] {
  const options = cwd ? { cwd, encoding: "utf-8" as const } : { encoding: "utf-8" as const };
  try {
    const staged = execSync("git diff --cached --name-status", options);
    const unstaged = execSync("git diff --name-status", options);
    const combined = `${staged}\n${unstaged}`.trim();
    if (!combined) return [];

    const files = parseDiffNameStatus(combined);
    const seen = new Set<string>();
    return files.filter((f) => {
      if (seen.has(f.path)) return false;
      seen.add(f.path);
      return true;
    });
  } catch {
    return [];
  }
}

export function analyzeDiff(cwd?: string): DiffAnalysis {
  const changedFiles = getChangedFiles(cwd);
  const diff = getGitDiff(cwd);

  return {
    changedFiles,
    componentFiles: changedFiles.filter((f) => f.isComponent),
    pageFiles: changedFiles.filter((f) => f.isPage),
    routeFiles: changedFiles.filter((f) => f.isRoute),
    diff,
  };
}
