import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SandboxConfig {
  image?: string;
  repo?: string;
  branch?: string;
  envVars?: Record<string, string>;
  timeout?: number;
}

export interface SandboxHandle {
  id: string;
  status: "creating" | "running" | "stopped" | "failed";
  host?: string;
  port?: number;
}

export interface PipelineRunOptions {
  sandbox: SandboxHandle;
  command: string;
  args?: string[];
  cwd?: string;
}

export interface PipelineResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  artifacts: string[];
}

const DEFAULT_IMAGE = "daytonaio/aura-runner:latest";
const DEFAULT_TIMEOUT = 600_000;

export function buildSandboxConfig(
  overrides?: Partial<SandboxConfig>,
): SandboxConfig {
  return {
    image: overrides?.image ?? DEFAULT_IMAGE,
    timeout: overrides?.timeout ?? DEFAULT_TIMEOUT,
    ...overrides,
  };
}

export async function createSandbox(
  config: SandboxConfig,
): Promise<SandboxHandle> {
  const args = ["create"];

  if (config.repo) {
    args.push("--repo", config.repo);
  }

  if (config.branch) {
    args.push("--branch", config.branch);
  }

  if (config.image) {
    args.push("--image", config.image);
  }

  if (config.envVars) {
    for (const [key, value] of Object.entries(config.envVars)) {
      args.push("--env", `${key}=${value}`);
    }
  }

  try {
    const { stdout } = await execFileAsync("daytona", args, {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    });

    const id = stdout.trim().split("\n").pop()?.trim() ?? "";

    return {
      id,
      status: "running",
    };
  } catch {
    return {
      id: "",
      status: "failed",
    };
  }
}

export async function runInSandbox(
  options: PipelineRunOptions,
): Promise<PipelineResult> {
  const args = ["exec", options.sandbox.id, "--"];
  const cmdParts = [options.command, ...(options.args ?? [])];

  if (options.cwd) {
    args.push("sh", "-c", `cd ${options.cwd} && ${cmdParts.join(" ")}`);
  } else {
    args.push(...cmdParts);
  }

  try {
    const { stdout, stderr } = await execFileAsync("daytona", args, {
      timeout: DEFAULT_TIMEOUT,
      maxBuffer: 50 * 1024 * 1024,
    });

    return {
      exitCode: 0,
      stdout,
      stderr,
      artifacts: parseArtifactPaths(stdout),
    };
  } catch (err: unknown) {
    const execErr = err as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: execErr.code ?? 1,
      stdout: execErr.stdout ?? "",
      stderr: execErr.stderr ?? "",
      artifacts: [],
    };
  }
}

export async function exportArtifact(
  sandbox: SandboxHandle,
  remotePath: string,
  localPath: string,
): Promise<boolean> {
  try {
    await execFileAsync("daytona", [
      "cp",
      `${sandbox.id}:${remotePath}`,
      localPath,
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function destroySandbox(
  sandbox: SandboxHandle,
): Promise<void> {
  try {
    await execFileAsync("daytona", ["delete", sandbox.id, "--force"]);
  } catch {
    // best-effort cleanup
  }
}

export async function runPipeline(
  config: SandboxConfig,
  steps: Array<{
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
  }>,
): Promise<{
  sandbox: SandboxHandle;
  results: Array<{ name: string; result: PipelineResult }>;
  success: boolean;
}> {
  const sandbox = await createSandbox(config);
  if (sandbox.status === "failed") {
    return { sandbox, results: [], success: false };
  }

  const results: Array<{ name: string; result: PipelineResult }> = [];
  let success = true;

  for (const step of steps) {
    const result = await runInSandbox({
      sandbox,
      command: step.command,
      args: step.args,
      cwd: step.cwd,
    });

    results.push({ name: step.name, result });

    if (result.exitCode !== 0) {
      success = false;
      break;
    }
  }

  return { sandbox, results, success };
}

function parseArtifactPaths(output: string): string[] {
  const paths: string[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = /(?:artifact|output|saved|wrote|created):\s*(.+)/i.exec(
      line,
    );
    if (match?.[1]) {
      paths.push(match[1].trim());
    }
  }
  return paths;
}

export function buildRecordingPipelineSteps(
  projectDir: string,
): Array<{
  name: string;
  command: string;
  args: string[];
  cwd: string;
}> {
  return [
    {
      name: "install-deps",
      command: "npm",
      args: ["ci"],
      cwd: projectDir,
    },
    {
      name: "install-browsers",
      command: "npx",
      args: ["playwright", "install", "--with-deps", "chromium"],
      cwd: projectDir,
    },
    {
      name: "build",
      command: "npm",
      args: ["run", "build"],
      cwd: projectDir,
    },
    {
      name: "record-demo",
      command: "npx",
      args: ["tsx", "packages/core/src/index.ts"],
      cwd: projectDir,
    },
  ];
}
