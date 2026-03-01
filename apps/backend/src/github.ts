const GITHUB_API = "https://api.github.com";

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "aura-backend",
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function getPrDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        ...headers(token),
        Accept: "application/vnd.github.v3.diff",
      },
    },
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
      skip =
        line.includes("package-lock.json") ||
        line.includes("yarn.lock") ||
        line.includes("pnpm-lock");
    }
    if (!skip) {
      filtered.push(line);
    }
  }
  return filtered.join("\n");
}

export async function getBranchSha(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get branch SHA for ${branch}: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

export async function branchExists(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers: headers(token) },
  );
  return res.ok;
}

export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  name: string,
  sha: string,
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create branch ${name}: ${res.status} ${body}`);
  }
}

export async function fileExists(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<boolean> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: headers(token) },
  );
  return res.ok;
}

export async function createFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
): Promise<void> {
  const encoded = btoa(content);
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: encoded, branch }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create file ${path}: ${res.status} ${body}`);
  }
}

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<{ number: number; html_url: string }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, head, base }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create PR: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, html_url: data.html_url };
}

export async function getRepoPublicKey(
  token: string,
  owner: string,
  repo: string,
): Promise<{ key_id: string; key: string }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get repo public key: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { key_id: string; key: string };
  return { key_id: data.key_id, key: data.key };
}

export async function createPrComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<{ id: number }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create PR comment: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { id: number };
  return { id: data.id };
}

export async function updatePrComment(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update PR comment: ${res.status} ${text}`);
  }
}

export async function setRepoSecret(
  token: string,
  owner: string,
  repo: string,
  name: string,
  encryptedValue: string,
  keyId: string,
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/${name}`,
    {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id: keyId }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to set secret ${name}: ${res.status} ${body}`);
  }
}
