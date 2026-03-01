"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { listRuns, logout, type RunListItem } from "../api-client";
import { useApi } from "../hooks";
import { useAuth } from "../auth-provider";
import styles from "./page.module.css";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const runs = useApi<RunListItem[]>(() => listRuns(), []);

  async function handleSignOut() {
    await logout();
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/sign-in");
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}><p>loading...</p></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Glimpse</h1>
          <span className={styles.subtitle}>
            {runs ? `${String(runs.length)} recording${runs.length !== 1 ? "s" : ""}` : "loading..."}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {session ? (
            <span style={{ fontSize: "13px", fontFamily: "var(--font-geist-mono), monospace", opacity: 0.6 }}>
              @{session.github_login}
            </span>
          ) : null}
          <button
            className={styles.signOutButton}
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      {runs === undefined ? (
        <div className={styles.empty}>
          <p>loading...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No recordings yet</p>
          <p>
            Run <code>/record-demo</code> or open a PR to generate a demo
            video.
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
    </div>
  );
}
