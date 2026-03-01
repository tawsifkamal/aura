import { Daytona, type Sandbox } from "@daytonaio/sdk";

// ── Message shape ───────────────────────────────────────────────────
interface PrPipelineMessage {
  accessToken: string;
  owner: string;
  repoName: string;
  prNumber: number;
  branch: string;
  isPrivate: boolean;
}

// ── Convex client (lightweight fetch wrapper) ───────────────────────
class ConvexClient {
  private baseUrl: string;
  private adminSecret: string | undefined;

  constructor(url: string, adminSecret?: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.adminSecret = adminSecret || undefined;
  }

  async query<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.call<T>("query", path, args);
  }

  async mutation<T = unknown>(path: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.call<T>("mutation", path, args);
  }

  private async call<T>(kind: "query" | "mutation", path: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/api/${kind}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const argsWithAuth = this.adminSecret ? { ...args, adminSecret: this.adminSecret } : args;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ path, args: argsWithAuth, format: "json" }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Convex ${kind} "${path}" failed (${res.status}): ${text}`);
    }

    const envelope = (await res.json()) as { value: T; status: string };
    if (envelope.status !== "success") {
      throw new Error(`Convex ${kind} "${path}" returned status: ${envelope.status}`);
    }
    return envelope.value;
  }
}

// ── GitHub helpers ──────────────────────────────────────────────────
const GITHUB_API = "https://api.github.com";

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "aura-backend",
  "X-GitHub-Api-Version": "2022-11-28",
});

async function createPrComment(
  token: string, owner: string, repo: string, prNumber: number, body: string,
): Promise<{ id: number }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create PR comment: ${res.status} ${text}`);
  }
  return (await res.json()) as { id: number };
}

async function updatePrComment(
  token: string, owner: string, repo: string, commentId: number, body: string,
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update PR comment: ${res.status} ${text}`);
  }
}

async function getPrDiff(
  token: string, owner: string, repo: string, prNumber: number,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: { ...ghHeaders(token), Accept: "application/vnd.github.v3.diff" } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get PR diff: ${res.status} ${text}`);
  }
  const diff = await res.text();

  // Filter out lock files to keep the diff small
  const lines = diff.split("\n");
  const filtered: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      skip = line.includes("package-lock.json") || line.includes("yarn.lock") || line.includes("pnpm-lock");
    }
    if (!skip) filtered.push(line);
  }
  return filtered.join("\n");
}

// ── Daytona sandbox helpers ─────────────────────────────────────────
interface AnalysisResult {
  has_ui_changes: boolean;
  setup: string[];
  base_url: string;
  tasks: Array<{ id: string; description: string }>;
}

interface RecordingResult {
  verdict: string;
  reasoning: string;
  videoPath: string;
  outputDir: string;
}

async function createSandbox(apiKey: string): Promise<{ daytona: Daytona; sandbox: Sandbox }> {
  const daytona = new Daytona({ apiKey });
  const sandbox = await daytona.create({ snapshot: "glimpse" });
  return { daytona, sandbox };
}

async function cloneRepo(sandbox: Sandbox, repoUrl: string, branch: string): Promise<void> {
  await sandbox.process.executeCommand(`git clone --branch ${branch} ${repoUrl} /home/daytona/repo`);
}

async function writeDiffFile(sandbox: Sandbox, diff: string): Promise<void> {
  const b64 = Buffer.from(diff, "utf-8").toString("base64");
  await sandbox.process.executeCommand(`echo '${b64}' | base64 -d > /home/daytona/repo/__pr_diff.patch`);
}

async function analyzeChanges(sandbox: Sandbox, groqApiKey: string): Promise<AnalysisResult> {
  const prompt =
    "Read the file __pr_diff.patch which contains the PR diff. " +
    "Also explore the repo to understand context (package.json, README, etc). " +
    "Then write a JSON object to __testing_steps.json with this exact schema: " +
    '{"has_ui_changes": true/false, "setup": ["npm install", "npm run dev"], "base_url": "http://localhost:3000", "tasks": [{"id": "kebab-id", "description": "Navigate to /path. Do action. Verify result."}]} ' +
    "has_ui_changes: true if the PR includes any changes visible in the browser UI, false if it only touches backend/config/docs. " +
    "setup: shell commands to install deps and start the dev server. Look at package.json scripts to determine the right commands. " +
    "base_url: the URL where the app is served locally after running the setup commands (e.g. http://localhost:3000). Check package.json, framework config, or dev server settings to determine the correct port. " +
    "tasks: browser testing steps (empty array if has_ui_changes is false). " +
    "Task rules: Start with Navigate to /path. Use element IDs like id=search-input. End with a verification. Be specific. Each step tests ONE change. Between each action (navigation, click, type, etc.) include a 'Wait 1 second.' instruction so the UI has time to update. " +
    "Write the file now.";

  await sandbox.process.executeCommand(
    `export PATH="/root/.opencode/bin:$PATH" && cd /home/daytona/repo && opencode run --format json -m groq/moonshotai/kimi-k2-instruct-0905 "${prompt}"`,
    undefined,
    { GROQ_API_KEY: groqApiKey },
    180,
  );

  const cat = await sandbox.process.executeCommand(`cat /home/daytona/repo/__testing_steps.json`);
  return JSON.parse(cat.result) as AnalysisResult;
}

async function runSetupAndWait(sandbox: Sandbox, commands: string[], baseUrl: string, deadlineSecs = 30): Promise<void> {
  if (commands.length === 0) return;
  const cwd = "/home/daytona/repo";

  // Kill any existing process on the target port
  const portMatch = baseUrl.match(/:(\d+)/);
  if (portMatch) {
    await sandbox.process.executeCommand(`fuser -k ${portMatch[1]}/tcp 2>/dev/null || true`, undefined, undefined, 10);
  }

  // Run all commands (npm install && npm run dev) as a single chain.
  // npm run dev never exits (it's a server), so executeCommand will block forever.
  // Use Promise.race to proceed after a fixed deadline regardless.
  const script = commands.join(" && ");
  console.log(`[runSetup] firing: ${script} (deadline: ${deadlineSecs}s)`);

  const execPromise = sandbox.process.executeCommand(
    `bash -c 'cd ${cwd} && ${script}'`,
    undefined, undefined, 300,
  ).catch((err) => {
    console.log(`[runSetup] executeCommand error (ignored): ${err}`);
  });

  await Promise.race([
    execPromise,
    new Promise<void>((resolve) => setTimeout(resolve, deadlineSecs * 1000)),
  ]);

  console.log(`[runSetup] deadline reached or command returned, proceeding`);
}

async function recordVideo(
  sandbox: Sandbox, tasks: Array<{ id: string; description: string }>,
  baseUrl: string, anthropicApiKey: string,
): Promise<RecordingResult> {
  const tasksJson = JSON.stringify(tasks);
  const escapedTasksJson = tasksJson.replace(/'/g, "'\\''");

  const cmd =
    `cd /home/daytona/repo && python -m demo_recorder.cli ` +
    `--tasks '${escapedTasksJson}' --base-url ${baseUrl} --headless --max-steps 20 ` +
    `--model claude-opus-4-6`;

  const result = await sandbox.process.executeCommand(
    cmd, undefined, { ANTHROPIC_API_KEY: anthropicApiKey }, 300,
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

async function uploadVideoFromSandbox(sandbox: Sandbox, videoPath: string, uploadUrl: string): Promise<string> {
  const contentType = videoPath.endsWith(".webm") ? "video/webm" : "video/mp4";

  const result = await sandbox.process.executeCommand(
    `curl -s -X POST "${uploadUrl}" -H "Content-Type: ${contentType}" --data-binary @${videoPath}`,
    undefined, undefined, 120,
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

async function destroySandbox(daytona: Daytona, sandbox: Sandbox): Promise<void> {
  await daytona.delete(sandbox);
}

// ── Pipeline ────────────────────────────────────────────────────────
async function runPipeline(msg: PrPipelineMessage, env: Env): Promise<void> {
  const { accessToken, owner, repoName, prNumber, branch, isPrivate } = msg;
  const convex = new ConvexClient(env.CONVEX_URL, env.CONVEX_ADMIN_SECRET);

  const log = (step: string, detail?: string) => {
    console.log(`[pipeline] [${owner}/${repoName}#${prNumber}] ${step}${detail ? `: ${detail}` : ""}`);
  };

  let commentId: number | undefined;
  let commentBody = "";

  const updateComment = async (line: string) => {
    commentBody += (commentBody ? "\n" : "") + line;
    if (commentId) {
      await updatePrComment(accessToken, owner, repoName, commentId, commentBody);
    }
  };

  try {
    // Step 1: Post initial PR comment
    log("step 1", "posting initial comment");
    commentBody = "🔄 **Aura** is analyzing this pull request...";
    const comment = await createPrComment(accessToken, owner, repoName, prNumber, commentBody);
    commentId = comment.id;

    // Step 2: Fetch PR diff
    log("step 2", "fetching PR diff");
    const diff = await getPrDiff(accessToken, owner, repoName, prNumber);
    log("step 2", `diff fetched (${diff.length} chars)`);
    await updateComment("📋 Fetched PR diff.");

    // Step 3: Create Daytona sandbox
    log("step 3", "creating sandbox");
    const { daytona, sandbox } = await createSandbox(env.DAYTONA_API_KEY);
    log("step 3", `sandbox created: ${sandbox.id}`);

    try {
      // Step 4: Clone repo
      await updateComment("⏳ Sandbox ready. Cloning repository...");
      const cloneUrl = isPrivate
        ? `https://x-access-token:${accessToken}@github.com/${owner}/${repoName}.git`
        : `https://github.com/${owner}/${repoName}.git`;

      log("step 4", `cloning ${owner}/${repoName} branch=${branch}`);
      await cloneRepo(sandbox, cloneUrl, branch);
      log("step 4", "clone done");

      // Step 5: Write diff file
      await writeDiffFile(sandbox, diff);
      await updateComment("🔍 Repository cloned. Analyzing PR changes...");

      // Step 6: Analyze changes
      log("step 6", "running OpenCode analysis");
      const analysis = await analyzeChanges(sandbox, env.GROQ_API_KEY);
      log("step 6", `analysis done: has_ui_changes=${analysis.has_ui_changes}, tasks=${analysis.tasks.length}`);

      // Step 7: Post analysis results
      if (analysis.has_ui_changes) {
        const taskList = analysis.tasks.map((t, i) => `${i + 1}. ${t.description}`).join("\n");
        await updateComment(
          `✅ Analysis complete.\n\n` +
          `**Base URL:** \`${analysis.base_url}\`\n\n` +
          `**Setup:**\n\`\`\`bash\n${analysis.setup.join("\n")}\n\`\`\`\n\n` +
          `**Testing steps:**\n${taskList}`,
        );

        // Step 8+9: Run setup and wait for server (combined with deadline)
        log("step 8", `running setup: ${analysis.setup.join(" && ")}`);
        await updateComment("⏳ Setting up project...");
        await runSetupAndWait(sandbox, analysis.setup, analysis.base_url, 30);
        log("step 9", "setup deadline reached, proceeding to recording");
        await updateComment("✅ Dev server is running.");

        // Step 10: Record video
        log("step 10", "starting browser recording");
        await updateComment("🎥 Recording demo video...");
        const recording = await recordVideo(sandbox, analysis.tasks, analysis.base_url, env.ANTHROPIC_API_KEY);
        log("step 10", `recording done: verdict=${recording.verdict}, video=${recording.videoPath}`);

        const verdictIcon = recording.verdict === "pass" ? "✅" : "❌";
        await updateComment(
          `${verdictIcon} Recording complete — verdict: **${recording.verdict}**` +
          (recording.reasoning ? `\n> ${recording.reasoning}` : ""),
        );

        // Step 11: Upload video to Convex
        log("step 11", "uploading video");
        await updateComment("⬆️ Uploading video...");
        const uploadUrl = await convex.mutation<string>("runs:generateUploadUrl");
        const storageId = await uploadVideoFromSandbox(sandbox, recording.videoPath, uploadUrl);
        log("step 11", `uploaded, storageId=${storageId}`);

        // Step 12: Get signed URL and embed in comment
        const videoUrl = await convex.query<string | null>("runs:getStorageUrl", { storageId });
        log("step 12", `videoUrl=${videoUrl ? "obtained" : "null"}`);

        if (videoUrl) {
          await updateComment(
            `\n### 🎬 Demo Video\n\n` +
            `<video src="${videoUrl}" controls muted autoplay loop width="640"></video>\n\n` +
            `[Download video](${videoUrl})`,
          );
        }

        log("cleanup", "destroying sandbox");
        await destroySandbox(daytona, sandbox);
        log("done", "pipeline complete");
      } else {
        await updateComment("✅ Analysis complete. No UI changes detected — skipping video recording.");
        await destroySandbox(daytona, sandbox);
        log("done", "no UI changes, sandbox destroyed");
      }
    } catch (innerErr) {
      await destroySandbox(daytona, sandbox).catch(() => {});
      throw innerErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] failed: ${message}`);

    if (commentId) {
      await updateComment(`❌ Something went wrong: ${message}`).catch(() => {});
    }

    throw err; // re-throw so the queue handler can retry
  }
}

// ── Queue consumer export ───────────────────────────────────────────
export default {
  async queue(batch: MessageBatch<PrPipelineMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await runPipeline(message.body, env);
        message.ack();
      } catch (err) {
        console.error(`[queue] message ${message.id} failed (attempt ${message.attempts}):`, err);
        if (message.attempts < 2) {
          message.retry();
        } else {
          message.ack(); // give up — error already posted to PR comment
        }
      }
    }
  },
};
