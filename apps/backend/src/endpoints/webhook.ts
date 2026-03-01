import { Hono } from "hono";
import type { ConvexClient } from "../convex";
import { createPrComment, updatePrComment, getPrDiff } from "../github";
import { createSandbox, cloneRepo, writeDiffFile, analyzeChanges, runSetup, waitForServer, recordVideo, uploadVideoFromSandbox, destroySandbox } from "../daytona";

export const webhooks = new Hono<{
  Bindings: Env;
  Variables: { convex: ConvexClient };
}>();

// POST /pr — called by GitHub Actions when a PR is opened/updated
webhooks.post("/pr", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7); // strip "Bearer "

  const convex: ConvexClient = c.get("convex");

  // Validate the API key against Convex — fetch full user doc for accessToken
  const user = await convex.query<{
    _id: string;
    githubLogin: string;
    accessToken: string;
  } | null>(
    "users:getByApiKey",
    { apiKey },
  );

  if (!user) {
    return c.json({ error: "Invalid API key" }, { status: 403 });
  }

  const body = await c.req.json<{
    repository_id: number;
    branch: string;
    base_branch?: string;
    pr_number?: number;
    commit_sha?: string;
  }>();

  // Verify the user has this repository enabled
  const repo = await convex.query<{
    _id: string;
    status: string;
    defaultBranch: string;
    fullName: string;
    owner: string;
    name: string;
    isPrivate: boolean;
  } | null>(
    "repositories:getByUserAndGithubId",
    { userId: user._id, githubRepoId: body.repository_id },
  );

  if (!repo || (repo.status !== "added" && repo.status !== "synced")) {
    return c.json(
      { error: "Repository not enabled for this API key" },
      { status: 403 },
    );
  }

  // Only process PRs targeting the default branch
  if (body.base_branch && body.base_branch !== repo.defaultBranch) {
    return c.json({
      success: true,
      message: "Skipped — PR does not target the default branch",
      base_branch: body.base_branch,
      default_branch: repo.defaultBranch,
    });
  }

  console.log(
    `[webhook/pr] user=${user.githubLogin} repo=${body.repository_id} branch=${body.branch} base=${body.base_branch ?? repo.defaultBranch} pr=${body.pr_number ?? "none"} sha=${body.commit_sha ?? "none"}`,
  );

  // If there's a PR number, kick off the async pipeline
  if (body.pr_number) {
    const prNumber = body.pr_number;
    const branch = body.branch;
    const accessToken = user.accessToken;
    const owner = repo.owner;
    const repoName = repo.name;
    const isPrivate = repo.isPrivate;
    const daytonaApiKey = c.env.DAYTONA_API_KEY;
    const groqApiKey = c.env.GROQ_API_KEY;
    const browserUseApiKey = c.env.BROWSER_USE_API_KEY;

    const pipeline = async () => {
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
        commentBody = "🔄 **Aura** is analyzing this pull request...";
        const comment = await createPrComment(
          accessToken,
          owner,
          repoName,
          prNumber,
          commentBody,
        );
        commentId = comment.id;

        // Step 2: Fetch PR diff via GitHub API (fast, no clone needed)
        const diff = await getPrDiff(accessToken, owner, repoName, prNumber);
        await updateComment("📋 Fetched PR diff.");

        // Step 3: Create Daytona sandbox (no env vars — secrets passed per-command)
        const { daytona, sandbox } = await createSandbox(daytonaApiKey);

        try {
          // Step 4: Sandbox ready, cloning
          await updateComment("⏳ Sandbox ready. Cloning repository...");

          // Clone repo (use token for private repos)
          const cloneUrl = isPrivate
            ? `https://x-access-token:${accessToken}@github.com/${owner}/${repoName}.git`
            : `https://github.com/${owner}/${repoName}.git`;

          await cloneRepo(sandbox, cloneUrl, branch);

          // Step 5: Write pre-fetched diff into the repo
          await writeDiffFile(sandbox, diff);
          await updateComment("🔍 Repository cloned. Analyzing PR changes...");

          // Step 6: Run OpenCode to analyze the diff and generate testing steps
          const analysis = await analyzeChanges(sandbox, groqApiKey);

          // Step 7: Analysis complete
          if (analysis.has_ui_changes) {
            const taskList = analysis.tasks
              .map((t, i) => `${i + 1}. ${t.description}`)
              .join("\n");
            await updateComment(
              `✅ Analysis complete.\n\n` +
              `**Base URL:** \`${analysis.base_url}\`\n\n` +
              `**Setup:**\n\`\`\`bash\n${analysis.setup.join("\n")}\n\`\`\`\n\n` +
              `**Testing steps:**\n${taskList}`
            );

            // Step 8: Run setup commands (last one starts dev server in background)
            await updateComment("⏳ Setting up project...");
            await runSetup(sandbox, analysis.setup);

            // Step 9: Wait for dev server to be reachable
            await waitForServer(sandbox, analysis.base_url, 60);
            await updateComment("✅ Dev server is running.");

            // Step 10: Record browser demo video
            await updateComment("🎥 Recording demo video...");
            const recording = await recordVideo(
              sandbox,
              analysis.tasks,
              analysis.base_url,
              browserUseApiKey,
            );

            const verdictIcon = recording.verdict === "pass" ? "✅" : "❌";
            await updateComment(
              `${verdictIcon} Recording complete — verdict: **${recording.verdict}**` +
              (recording.reasoning ? `\n> ${recording.reasoning}` : ""),
            );

            // Step 11: Upload video to Convex storage
            await updateComment("⬆️ Uploading video...");
            const uploadUrl = await convex.mutation<string>("runs:generateUploadUrl");
            const storageId = await uploadVideoFromSandbox(
              sandbox,
              recording.videoPath,
              uploadUrl,
            );

            // Step 12: Get signed download URL
            const videoUrl = await convex.query<string | null>(
              "runs:getStorageUrl",
              { storageId },
            );

            if (videoUrl) {
              await updateComment(
                `\n### 🎬 Demo Video\n\n` +
                `<video src="${videoUrl}" controls muted autoplay loop width="640"></video>\n\n` +
                `[Download video](${videoUrl})`,
              );
            }

            await destroySandbox(daytona, sandbox);
          } else {
            await updateComment("✅ Analysis complete. No UI changes detected — skipping video recording.");
            await destroySandbox(daytona, sandbox);
          }
        } catch (innerErr) {
          // Cleanup sandbox on error during clone/update
          await destroySandbox(daytona, sandbox).catch(() => {});
          throw innerErr;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[webhook/pr] pipeline failed: ${message}`);

        if (commentId) {
          await updateComment(`❌ Something went wrong: ${message}`).catch(() => {});
        }
      }
    };

    c.executionCtx.waitUntil(pipeline());
  }

  return c.json({
    success: true,
    message: "PR webhook received",
    user: user.githubLogin,
    repository_id: body.repository_id,
    branch: body.branch,
  });
});
