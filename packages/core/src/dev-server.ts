import { spawn, type ChildProcess } from "node:child_process";
import { get } from "node:http";
import { detectWebApp, type WebAppInfo } from "./web-app-detector.js";

export interface DevServerOptions {
  projectDir: string;
  port?: number;
  script?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface DevServerHandle {
  url: string;
  port: number;
  process: ChildProcess;
  kill: () => void;
}

const COMMON_PORTS = [3000, 5173, 8080, 4200, 4321, 8000];
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

function httpCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(`http://localhost:${String(port)}`, (res) => {
      // Any response means the server is up (even redirects)
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(
  port: number,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await httpCheck(port);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return false;
}

async function findActivePort(ports: number[]): Promise<number | null> {
  for (const port of ports) {
    const active = await httpCheck(port);
    if (active) return port;
  }
  return null;
}

export function resolveDevCommand(info: WebAppInfo): {
  command: string;
  args: string[];
} | null {
  if (!info.devScript) return null;
  return { command: "npm", args: ["run", info.devScript] };
}

export function startServerProcess(
  command: string,
  args: string[],
  projectDir: string
): ChildProcess {
  const child = spawn(command, args, {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  // Prevent unhandled error crashes
  child.on("error", () => {
    // Handled by caller
  });

  return child;
}

export async function startDevServer(
  options: DevServerOptions
): Promise<DevServerHandle> {
  const {
    projectDir,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;

  const info = detectWebApp(projectDir);

  const scriptName = options.script ?? info.devScript;
  if (!scriptName) {
    throw new Error(
      "No dev script found in package.json. Looked for: dev, start, serve, develop"
    );
  }

  const port = options.port ?? info.devPort ?? 3000;

  // Check if something is already running on that port
  const alreadyUp = await httpCheck(port);
  if (alreadyUp) {
    // Return a no-op handle — server is already running
    const noopProcess = spawn("echo", ["server already running"], {
      stdio: "ignore",
    });
    return {
      url: `http://localhost:${String(port)}`,
      port,
      process: noopProcess,
      kill: () => {
        /* nothing to kill */
      },
    };
  }

  const child = startServerProcess("npm", ["run", scriptName], projectDir);

  const kill = () => {
    try {
      if (child.pid) {
        // Kill the process group (detached)
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      // Already dead
    }
  };

  // Wait for the server to be ready
  const ready = await waitForPort(port, timeoutMs, pollIntervalMs);

  if (!ready) {
    kill();
    // Try scanning common ports in case it started on a different one
    const altPort = await findActivePort(
      COMMON_PORTS.filter((p) => p !== port)
    );
    if (altPort) {
      return {
        url: `http://localhost:${String(altPort)}`,
        port: altPort,
        process: child,
        kill,
      };
    }
    throw new Error(
      `Dev server did not become ready within ${String(timeoutMs)}ms on port ${String(port)}`
    );
  }

  return {
    url: `http://localhost:${String(port)}`,
    port,
    process: child,
    kill,
  };
}

export { waitForPort, httpCheck, findActivePort };
