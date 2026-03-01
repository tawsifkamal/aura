"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import Link from "next/link";
import { DEMO_RUNS } from "../data";
import styles from "./page.module.css";

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${String(s)}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m)}m ${String(rem)}s`;
}

function formatTimestamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m)}:${String(rem).padStart(2, "0")}`;
}

export default function RecordingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const run = DEMO_RUNS.find((r) => r.id === id);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [promptStatus, setPromptStatus] = useState<
    "idle" | "sending" | "sent"
  >("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (playing && run) {
      const step = 50;
      const increment = (step / run.durationMs) * 100;
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            stop();
            setPlaying(false);
            return 100;
          }
          return prev + increment;
        });
      }, step);
    } else {
      stop();
    }
    return stop;
  }, [playing, run, stop]);

  if (!run) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <p>Recording not found</p>
          <Link href="/dashboard" className={styles.backLink}>
            &larr; Back to recordings
          </Link>
        </div>
      </div>
    );
  }

  const currentTimeMs = (progress / 100) * run.durationMs;
  const currentAction = [...run.actions]
    .reverse()
    .find((a) => a.timestamp <= currentTimeMs);

  function togglePlay() {
    if (progress >= 100) {
      setProgress(0);
    }
    setPlaying((p) => !p);
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setProgress(Math.max(0, Math.min(100, pct)));
  }

  async function handlePromptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPromptStatus("sending");
    await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: run?.id, prompt }),
    });
    setPromptStatus("sent");
    setPrompt("");
    setTimeout(() => setPromptStatus("idle"), 2000);
  }

  return (
    <div className={styles.page}>
      <Link href="/dashboard" className={styles.backLink}>
        &larr; Back to recordings
      </Link>

      <h1 className={styles.title}>{run.title}</h1>

      {/* Player */}
      <div className={styles.player}>
        <div className={styles.playerScreen}>
          <div className={styles.playerOverlay}>
            {currentAction ? (
              <span className={styles.actionLabel}>{currentAction.label}</span>
            ) : (
              <span className={styles.actionLabel}>Ready to play</span>
            )}
          </div>
          <button
            className={styles.playButton}
            onClick={togglePlay}
            type="button"
          >
            {playing ? "❚❚" : "▶"}
          </button>
        </div>

        {/* Progress bar */}
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Timeline */}
        <div className={styles.timeline} onClick={handleTimelineClick}>
          {run.actions.map((action) => {
            const left = (action.timestamp / run.durationMs) * 100;
            return (
              <div
                key={action.timestamp}
                className={styles.timelineMarker}
                style={{ left: `${left}%` }}
              >
                <div className={styles.markerTick} />
                <div className={styles.tooltip}>{action.label}</div>
              </div>
            );
          })}
          <div className={styles.timelineLabels}>
            <span>{formatTimestamp(currentTimeMs)}</span>
            <span>{formatTimestamp(run.durationMs)}</span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Status</span>
          <span className={styles.metaValue}>{run.status}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Duration</span>
          <span className={styles.metaValue}>
            {formatDuration(run.durationMs)}
          </span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Commit</span>
          <span className={styles.metaValue}>{run.commitSha}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Source</span>
          <span className={styles.metaValue}>{run.source}</span>
        </div>
      </div>

      {/* Routes */}
      <div className={styles.routes}>
        {run.routesTested.map((route) => (
          <span key={route} className={styles.route}>
            {route}
          </span>
        ))}
      </div>

      <p className={styles.summary}>{run.summary}</p>

      {/* PR Card */}
      <a
        href={run.pr.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.prCard}
      >
        <div className={styles.prTop}>
          <span className={styles.prLabel}>Pull Request</span>
          <span className={styles.prNumber}>#{run.pr.number}</span>
        </div>
        <p className={styles.prTitle}>{run.pr.title}</p>
        <span className={styles.prBranch}>{run.pr.branch}</span>
      </a>

      {/* Prompt */}
      <form className={styles.promptForm} onSubmit={handlePromptSubmit}>
        <label className={styles.promptLabel} htmlFor="prompt">
          Edit with AI
        </label>
        <div className={styles.promptRow}>
          <input
            id="prompt"
            className={styles.promptInput}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Trim the first 3 seconds, add zoom on the button click"
            disabled={promptStatus === "sending"}
          />
          <button
            className={styles.promptSubmit}
            type="submit"
            disabled={promptStatus === "sending" || !prompt.trim()}
          >
            {promptStatus === "sending"
              ? "Sending..."
              : promptStatus === "sent"
                ? "Sent!"
                : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
