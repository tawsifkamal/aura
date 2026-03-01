import { Daytona, type Sandbox } from "@daytonaio/sdk";

export async function createSandbox(
  apiKey: string,
): Promise<{ daytona: Daytona; sandbox: Sandbox }> {
  const daytona = new Daytona({ apiKey });
  const sandbox = await daytona.create({
    snapshot: "glimpse",
  });
  return { daytona, sandbox };
}

export async function cloneRepo(
  sandbox: Sandbox,
  repoUrl: string,
  branch: string,
): Promise<void> {
  await sandbox.process.executeCommand(
    `git clone --branch ${branch} ${repoUrl} /home/daytona/repo`,
  );
}

export async function writeDiffFile(
  sandbox: Sandbox,
  diff: string,
): Promise<void> {
  // Base64-encode the diff to avoid shell escaping issues, then decode in the sandbox
  const b64 = btoa(diff);
  await sandbox.process.executeCommand(
    `echo '${b64}' | base64 -d > /home/daytona/repo/__pr_diff.patch`,
  );
}

export interface AnalysisResult {
  has_ui_changes: boolean;
  setup: string[];
  base_url: string;
  tasks: Array<{ id: string; description: string }>;
}

export async function analyzeChanges(
  sandbox: Sandbox,
  groqApiKey: string,
): Promise<AnalysisResult> {
  const prompt =
    "Read the file __pr_diff.patch which contains the PR diff. " +
    "Also explore the repo to understand context (package.json, README, etc). " +
    "Then write a JSON object to __testing_steps.json with this exact schema: " +
    '{"has_ui_changes": true/false, "setup": ["npm install", "npm run dev"], "base_url": "http://localhost:3000", "tasks": [{"id": "kebab-id", "description": "Navigate to /path. Do action. Verify result."}]} ' +
    "has_ui_changes: true if the PR includes any changes visible in the browser UI, false if it only touches backend/config/docs. " +
    "setup: shell commands to install deps and start the dev server. Look at package.json scripts to determine the right commands. " +
    "base_url: the URL where the app is served locally after running the setup commands (e.g. http://localhost:3000). Check package.json, framework config, or dev server settings to determine the correct port. " +
    "tasks: browser testing steps (empty array if has_ui_changes is false). " +
    "Task rules: Start with Navigate to /path. Use element IDs like id=search-input. End with a verification. Be specific. Each step tests ONE change. " +
    "Write the file now.";

  // Pass GROQ_API_KEY via the per-command env parameter — scoped to this execution only
  await sandbox.process.executeCommand(
    `export PATH="/root/.opencode/bin:$PATH" && ` +
    `cd /home/daytona/repo && ` +
    `opencode run --format json -m groq/moonshotai/kimi-k2-instruct-0905 "${prompt}"`,
    undefined,
    { GROQ_API_KEY: groqApiKey },
    180,
  );

  // Read the generated file
  const cat = await sandbox.process.executeCommand(
    `cat /home/daytona/repo/__testing_steps.json`,
  );

  return JSON.parse(cat.result) as AnalysisResult;
}

export async function runSetup(
  sandbox: Sandbox,
  commands: string[],
): Promise<void> {
  if (commands.length === 0) return;

  const cwd = "/home/daytona/repo";

  // Run all commands except the last one synchronously
  for (let i = 0; i < commands.length - 1; i++) {
    const result = await sandbox.process.executeCommand(commands[i], cwd, undefined, 300);
    if (result.exitCode !== 0) {
      throw new Error(
        `Setup command failed (exit ${result.exitCode}): ${commands[i]}\n${result.result}`,
      );
    }
  }

  // Run last command (dev server) in background
  const lastCmd = commands[commands.length - 1];
  await sandbox.process.executeCommand(
    `nohup ${lastCmd} > /tmp/dev-server.log 2>&1 &`,
    cwd,
    undefined,
    10,
  );
}

export async function waitForServer(
  sandbox: Sandbox,
  baseUrl: string,
  timeoutSecs: number = 60,
): Promise<void> {
  const pollIntervalMs = 2000;
  const maxAttempts = Math.ceil((timeoutSecs * 1000) / pollIntervalMs);

  for (let i = 0; i < maxAttempts; i++) {
    const result = await sandbox.process.executeCommand(
      `curl -s -o /dev/null -w '%{http_code}' ${baseUrl}`,
      undefined,
      undefined,
      10,
    );

    const statusCode = parseInt(result.result.trim(), 10);
    if (statusCode >= 200 && statusCode < 400) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const logs = await sandbox.process.executeCommand(
    `tail -30 /tmp/dev-server.log 2>/dev/null || echo "No server logs found"`,
  );
  throw new Error(
    `Server at ${baseUrl} did not become ready within ${timeoutSecs}s.\nServer logs:\n${logs.result}`,
  );
}

export interface RecordingResult {
  verdict: string;
  reasoning: string;
  videoPath: string;
  outputDir: string;
}

export async function recordVideo(
  sandbox: Sandbox,
  tasks: Array<{ id: string; description: string }>,
  baseUrl: string,
  browserUseApiKey: string,
): Promise<RecordingResult> {
  const tasksJson = JSON.stringify(tasks);
  const escapedTasksJson = tasksJson.replace(/'/g, "'\\''");

  const cmd =
    `cd /home/daytona/repo && ` +
    `python -m demo_recorder.cli ` +
    `--tasks '${escapedTasksJson}' ` +
    `--base-url ${baseUrl} ` +
    `--headless ` +
    `--max-steps 20`;

  const result = await sandbox.process.executeCommand(
    cmd,
    undefined,
    { BROWSER_USE_API_KEY: browserUseApiKey },
    300,
  );

  const output = result.result;
  const getLine = (prefix: string): string => {
    const match = output.match(new RegExp(`^${prefix}:\\s*(.+)$`, "m"));
    return match?.[1]?.trim() ?? "";
  };

  const verdict = getLine("VERDICT") || "unknown";
  const reasoning = getLine("REASONING");
  const videoPath = getLine("VIDEO");
  const outputDir = getLine("OUTPUT_DIR");

  if (!videoPath || videoPath === "not found") {
    throw new Error(`Demo recorder did not produce a video.\nOutput:\n${output}`);
  }

  return { verdict, reasoning, videoPath, outputDir };
}

export async function uploadVideoFromSandbox(
  sandbox: Sandbox,
  videoPath: string,
  uploadUrl: string,
): Promise<string> {
  const contentType = videoPath.endsWith(".webm") ? "video/webm" : "video/mp4";

  const result = await sandbox.process.executeCommand(
    `curl -s -X POST "${uploadUrl}" ` +
    `-H "Content-Type: ${contentType}" ` +
    `--data-binary @${videoPath}`,
    undefined,
    undefined,
    120,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Video upload failed (exit ${result.exitCode}): ${result.result}`);
  }

  let parsed: { storageId?: string };
  try {
    parsed = JSON.parse(result.result);
  } catch {
    throw new Error(`Upload response is not valid JSON: ${result.result}`);
  }

  if (!parsed.storageId) {
    throw new Error(`Upload response missing storageId: ${result.result}`);
  }

  return parsed.storageId;
}

export async function destroySandbox(
  daytona: Daytona,
  sandbox: Sandbox,
): Promise<void> {
  await daytona.delete(sandbox);
}
