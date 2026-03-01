"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  listRuns,
  logout,
  listEnabledRepositories,
  listRepositories,
  enableRepository,
  disableRepository,
  type RunListItem,
  type EnabledRepo,
  type Repository,
} from "../api-client";
import { useApi } from "../hooks";
import { useAuth } from "../auth-provider";
import styles from "./page.module.css";

const WORKFLOW_YAML = `name: Aura PR Notification

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  notify-aura:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Aura
        run: |
          curl -s -X POST \\
            https://aura-backend.poppets-grungy03.workers.dev/api/webhooks/pr \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer \${{ secrets.AURA_API_KEY }}" \\
            -d '{
              "repository_id": \${{ github.event.repository.id }},
              "branch": "\${{ github.head_ref }}",
              "pr_number": \${{ github.event.pull_request.number }},
              "commit_sha": "\${{ github.event.pull_request.head.sha }}"
            }'`;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SetupModal({
  repo,
  onDone,
}: {
  repo: Repository;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(WORKFLOW_YAML);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.searchOverlay} onClick={onDone}>
      <div
        className={styles.setupModal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.setupHeader}>
          <h3 className={styles.setupTitle}>
            Set up Aura for {repo.full_name}
          </h3>
          <button
            className={styles.searchClose}
            onClick={onDone}
            type="button"
          >
            esc
          </button>
        </div>

        <div className={styles.setupSteps}>
          <div className={styles.setupStep}>
            <span className={styles.setupStepNum}>1</span>
            <div>
              <p className={styles.setupStepTitle}>
                Add the GitHub Actions workflow
              </p>
              <p className={styles.setupStepDesc}>
                Create{" "}
                <code>.github/workflows/aura.yml</code> in{" "}
                <strong>{repo.full_name}</strong> with the following content:
              </p>
            </div>
          </div>

          <div className={styles.codeBlock}>
            <button
              className={styles.copyButton}
              onClick={handleCopy}
              type="button"
            >
              {copied ? "copied" : "copy"}
            </button>
            <pre className={styles.codeContent}>{WORKFLOW_YAML}</pre>
          </div>

          <div className={styles.setupStep}>
            <span className={styles.setupStepNum}>2</span>
            <div>
              <p className={styles.setupStepTitle}>
                Add your API key as a repository secret
              </p>
              <p className={styles.setupStepDesc}>
                Go to <strong>{repo.full_name}</strong> &rarr; Settings &rarr;
                Secrets and variables &rarr; Actions &rarr; New repository
                secret. Name it <code>AURA_API_KEY</code> and paste your Aura
                API key.
              </p>
            </div>
          </div>

          <div className={styles.setupStep}>
            <span className={styles.setupStepNum}>3</span>
            <div>
              <p className={styles.setupStepTitle}>Open a pull request</p>
              <p className={styles.setupStepDesc}>
                When a PR is opened or updated, the workflow will notify Aura
                and a demo recording will be created automatically.
              </p>
            </div>
          </div>
        </div>

        <button
          className={styles.setupDoneButton}
          onClick={onDone}
          type="button"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function RepoSearch({
  onClose,
  onEnable,
  enabledIds,
}: {
  onClose: () => void;
  onEnable: (repo: Repository) => void;
  enabledIds: Set<number>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Repository[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setLoading(true);
    listRepositories()
      .then(setResults)
      .finally(() => setLoading(false));
  }, []);

  const doSearch = useCallback((q: string) => {
    setLoading(true);
    listRepositories(q || undefined)
      .then(setResults)
      .finally(() => setLoading(false));
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  return (
    <div className={styles.searchOverlay} onClick={onClose}>
      <div className={styles.searchModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.searchHeader}>
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search repositories..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
          />
          <button
            className={styles.searchClose}
            onClick={onClose}
            type="button"
          >
            esc
          </button>
        </div>

        <div className={styles.searchResults}>
          {loading && !results ? (
            <p className={styles.searchEmpty}>loading...</p>
          ) : results && results.length === 0 ? (
            <p className={styles.searchEmpty}>no repositories found</p>
          ) : (
            results?.map((repo) => {
              const isEnabled = enabledIds.has(repo.id);
              return (
                <button
                  key={repo.id}
                  className={styles.searchItem}
                  type="button"
                  onClick={() => {
                    if (!isEnabled) onEnable(repo);
                  }}
                  disabled={isEnabled}
                >
                  <div className={styles.searchItemInfo}>
                    <span className={styles.searchItemName}>
                      {repo.full_name}
                    </span>
                    <span className={styles.searchItemMeta}>
                      {repo.language ? `${repo.language} · ` : ""}
                      {repo.private ? "private" : "public"}
                      {repo.description
                        ? ` · ${repo.description.slice(0, 60)}`
                        : ""}
                    </span>
                  </div>
                  <span
                    className={
                      isEnabled
                        ? styles.searchItemBadgeEnabled
                        : styles.searchItemBadge
                    }
                  >
                    {isEnabled ? "enabled" : "enable"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const runs = useApi<RunListItem[]>(() => listRuns(), []);
  const [enabledRepos, setEnabledRepos] = useState<EnabledRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [setupRepo, setSetupRepo] = useState<Repository | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadEnabledRepos = useCallback(() => {
    setReposLoading(true);
    listEnabledRepositories()
      .then(setEnabledRepos)
      .catch(() => setEnabledRepos([]))
      .finally(() => setReposLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && session) {
      loadEnabledRepos();
    }
  }, [loading, session, loadEnabledRepos]);

  const enabledIds = new Set(enabledRepos.map((r) => r.githubRepoId));

  async function handleEnable(repo: Repository) {
    setTogglingId(repo.id);
    try {
      await enableRepository(repo.id, {
        full_name: repo.full_name,
        name: repo.name,
        owner: repo.owner,
        private: repo.private,
        html_url: repo.html_url,
        default_branch: repo.default_branch,
      });
      loadEnabledRepos();
      setShowSearch(false);
      setSetupRepo(repo);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDisable(githubRepoId: number) {
    setTogglingId(githubRepoId);
    try {
      await disableRepository(githubRepoId);
      loadEnabledRepos();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleSignOut() {
    await logout();
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/sign-in");
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Aura</h1>
          <span className={styles.subtitle}>
            {session ? `@${session.github_login}` : ""}
          </span>
        </div>
        <button
          className={styles.signOutButton}
          onClick={handleSignOut}
          type="button"
        >
          Sign out
        </button>
      </header>

      {/* Repositories Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Repositories</h2>
          <button
            className={styles.addButton}
            onClick={() => setShowSearch(true)}
            type="button"
          >
            + Add repository
          </button>
        </div>

        {reposLoading ? (
          <p className={styles.sectionMuted}>loading...</p>
        ) : enabledRepos.length === 0 ? (
          <div className={styles.repoEmpty}>
            <p className={styles.repoEmptyTitle}>No repositories enabled</p>
            <p className={styles.repoEmptyDesc}>
              Add a repository to start recording demo videos on every pull
              request.
            </p>
            <button
              className={styles.addButtonLarge}
              onClick={() => setShowSearch(true)}
              type="button"
            >
              + Add your first repository
            </button>
          </div>
        ) : (
          <div className={styles.repoList}>
            {enabledRepos.map((repo) => (
              <div key={repo._id} className={styles.repoItem}>
                <div className={styles.repoInfo}>
                  <a
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.repoName}
                  >
                    {repo.fullName}
                  </a>
                  <span className={styles.repoMeta}>
                    {repo.isPrivate ? "private" : "public"} ·{" "}
                    {repo.defaultBranch}
                    {repo.addedAt
                      ? ` · added ${formatTime(repo.addedAt)}`
                      : ""}
                  </span>
                </div>
                <button
                  className={styles.removeButton}
                  onClick={() => handleDisable(repo.githubRepoId)}
                  disabled={togglingId === repo.githubRepoId}
                  type="button"
                >
                  {togglingId === repo.githubRepoId ? "..." : "remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recordings Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recordings</h2>
          <span className={styles.sectionMuted}>
            {runs
              ? `${String(runs.length)} recording${runs.length !== 1 ? "s" : ""}`
              : ""}
          </span>
        </div>

        {runs === undefined ? (
          <p className={styles.sectionMuted}>loading...</p>
        ) : runs.length === 0 ? (
          <div className={styles.repoEmpty}>
            <p className={styles.repoEmptyTitle}>No recordings yet</p>
            <p className={styles.repoEmptyDesc}>
              Open a pull request on an enabled repository to generate a demo
              recording automatically.
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {runs.map((run) => (
              <Link
                key={run._id}
                href={`/runs/${run._id}`}
                className={styles.card}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardBadge}>{run.status}</span>
                  <span className={styles.cardSource}>{run.source}</span>
                </div>
                <p className={styles.cardSummary}>{run.summary}</p>
                <div className={styles.cardMeta}>
                  <span>{formatTime(run.timestamp)}</span>
                  {run.branch ? <span>{run.branch}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showSearch && (
        <RepoSearch
          onClose={() => setShowSearch(false)}
          onEnable={handleEnable}
          enabledIds={enabledIds}
        />
      )}

      {setupRepo && (
        <SetupModal
          repo={setupRepo}
          onDone={() => setSetupRepo(null)}
        />
      )}
    </div>
  );
}
