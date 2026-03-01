"use client";

import { getRun, type RunDetail } from "../../api-client";
import { useApi } from "../../hooks";
import Link from "next/link";
import { use } from "react";
import styles from "./page.module.css";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${String(s)}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m)}m ${String(rem)}s`;
}

export default function RunDetailPage(props: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(props.params);
  const run = useApi<RunDetail | null>(() => getRun(runId).catch(() => null), [runId]);

  if (run === undefined) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>loading...</p>
      </div>
    );
  }

  if (run === null) {
    return (
      <div className={styles.page}>
        <Link href="/" className={styles.back}>
          &larr; back
        </Link>
        <div className={styles.notFound}>
          <p className={styles.notFoundTitle}>Run not found</p>
          <p>The recording you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        &larr; back
      </Link>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Recording {run._id.slice(-6)}</h1>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {run.status === "completed" ? (
              <>
                <Link
                  href={`/runs/${run._id}/edit`}
                  style={{
                    fontSize: "12px",
                    fontFamily: "var(--font-geist-mono), monospace",
                    padding: "3px 8px",
                    border: "1px solid var(--border-strong)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.04em",
                  }}
                >
                  Edit
                </Link>
                <Link
                  href={`/runs/${run._id}/export`}
                  style={{
                    fontSize: "12px",
                    fontFamily: "var(--font-geist-mono), monospace",
                    padding: "3px 8px",
                    border: "1px solid var(--border-strong)",
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.04em",
                  }}
                >
                  Export
                </Link>
              </>
            ) : null}
            <span className={styles.badge}>{run.status}</span>
          </div>
        </div>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Time</span>
            <span className={styles.metaValue}>
              {formatTime(run.timestamp)}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Source</span>
            <span className={styles.metaValue}>{run.source}</span>
          </div>
          {run.branch ? (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Branch</span>
              <span className={styles.metaValue}>{run.branch}</span>
            </div>
          ) : null}
          {run.commitSha ? (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Commit</span>
              <span className={styles.metaValue}>
                {run.commitSha.slice(0, 7)}
              </span>
            </div>
          ) : null}
          {run.pr ? (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>PR</span>
              <span className={styles.metaValue}>#{String(run.pr)}</span>
            </div>
          ) : null}
          {run.durationMs ? (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Duration</span>
              <span className={styles.metaValue}>
                {formatDuration(run.durationMs)}
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.videoContainer}>
        {run.videoUrl ? (
          <video className={styles.video} src={run.videoUrl} controls />
        ) : (
          <div className={styles.videoPlaceholder}>
            {run.status === "completed" ? "no video attached" : run.status}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <p className={styles.summaryText}>{run.summary}</p>
      </div>

      {run.routesTested && run.routesTested.length > 0 ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Routes tested</h2>
          <div className={styles.routeList}>
            {run.routesTested.map((route) => (
              <span key={route} className={styles.routeChip}>
                {route}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {run.error ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Error</h2>
          <div className={styles.errorBox}>{run.error}</div>
        </div>
      ) : null}

      {run.screenshotUrls && run.screenshotUrls.length > 0 ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Screenshots</h2>
          <div className={styles.screenshotGrid}>
            {run.screenshotUrls.map((url, i) => (
              <div key={url} className={styles.screenshotItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Screenshot ${String(i + 1)}`} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {run.traceId ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Trace</h2>
          <p className={styles.metaValue}>{run.traceId}</p>
        </div>
      ) : null}
    </div>
  );
}
