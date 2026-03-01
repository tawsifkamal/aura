"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { authClient } from "../../lib/auth-client";
import type { RunWithVideo } from "../types";
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

function badgeClass(status: string): string {
  switch (status) {
    case "completed":
      return styles.badgeCompleted ?? "";
    case "running":
    case "uploading":
      return styles.badgeRunning ?? "";
    case "failed":
      return styles.badgeFailed ?? "";
    default:
      return styles.badgeQueued ?? "";
  }
}

export default function Dashboard() {
  const router = useRouter();
  const runs = useQuery(api.runs.list, {}) as RunWithVideo[] | undefined;

  function handleSignOut() {
    authClient.signOut().then(() => {
      router.push("/sign-in");
    });
  }

  if (runs === undefined) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Aura</h1>
            <span className={styles.subtitle}>loading...</span>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Aura</h1>
          <span className={styles.subtitle}>
            {runs.length} {runs.length === 1 ? "recording" : "recordings"}
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

      {runs.length === 0 ? (
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
              <div className={styles.cardTop}>
                <div className={styles.cardMeta}>
                  <span>{formatTime(run.timestamp)}</span>
                  {run.commitSha ? (
                    <span>{run.commitSha.slice(0, 7)}</span>
                  ) : null}
                </div>
                <span className={badgeClass(run.status)}>{run.status}</span>
              </div>

              <div className={styles.thumbnail}>
                {run.videoUrl ? (
                  <video src={run.videoUrl} muted preload="metadata" />
                ) : (
                  <span className={styles.thumbnailPlaceholder}>
                    {run.status === "completed" ? "no video" : run.status}
                  </span>
                )}
              </div>

              <p className={styles.summary}>{run.summary}</p>

              <div className={styles.cardBottom}>
                <span className={styles.sourceTag}>{run.source}</span>
                {run.durationMs ? (
                  <span className={styles.sourceTag}>
                    {formatDuration(run.durationMs)}
                  </span>
                ) : null}
              </div>

              {run.routesTested && run.routesTested.length > 0 ? (
                <div className={styles.routes}>
                  {run.routesTested.map((route) => (
                    <span key={route} className={styles.route}>
                      {route}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
