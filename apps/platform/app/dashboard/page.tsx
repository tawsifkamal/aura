"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEMO_RUNS } from "./data";
import styles from "./page.module.css";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${String(s)}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m)}m ${String(rem)}s`;
}

export default function Dashboard() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/sign-in");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Glimpse</h1>
          <span className={styles.subtitle}>
            {DEMO_RUNS.length} recordings
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

      <div className={styles.grid}>
        {DEMO_RUNS.map((run) => (
          <Link
            key={run.id}
            href={`/dashboard/${run.id}`}
            className={styles.card}
          >
            <div className={styles.cardTop}>
              <div className={styles.cardMeta}>
                <span>{formatTime(run.timestamp)}</span>
                <span>{run.commitSha}</span>
              </div>
              <span className={styles.badgeCompleted}>{run.status}</span>
            </div>

            <div className={styles.thumbnail}>
              <span className={styles.thumbnailPlaceholder}>{run.title}</span>
            </div>

            <p className={styles.summary}>{run.summary}</p>

            <div className={styles.cardBottom}>
              <span className={styles.sourceTag}>{run.source}</span>
              <span className={styles.sourceTag}>
                {formatDuration(run.durationMs)}
              </span>
            </div>

            <div className={styles.routes}>
              {run.routesTested.map((route) => (
                <span key={route} className={styles.route}>
                  {route}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
