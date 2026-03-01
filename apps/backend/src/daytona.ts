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

export async function destroySandbox(
  daytona: Daytona,
  sandbox: Sandbox,
): Promise<void> {
  await daytona.delete(sandbox);
}
