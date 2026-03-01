"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { ExportJob } from "../../../types";
import Link from "next/link";
import { use, useState } from "react";
import styles from "./page.module.css";

type Format = "mp4" | "gif";
type Quality = "web" | "high" | "preview";

const FPS_OPTIONS = [24, 30, 60] as const;
const RESOLUTION_OPTIONS = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "480p", width: 854, height: 480 },
] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${String((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ExportPage(props: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(props.params);
  const exportJobs = useQuery(api.exports.list, {
    runId: runId as never,
  }) as ExportJob[] | undefined;
  const createExport = useMutation(api.exports.create);

  const [format, setFormat] = useState<Format>("mp4");
  const [quality, setQuality] = useState<Quality>("web");
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState(0);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedRes = RESOLUTION_OPTIONS[resolution] ?? RESOLUTION_OPTIONS[0];

  async function handleExport() {
    setSubmitting(true);
    try {
      await createExport({
        runId: runId as never,
        format,
        fps,
        width: selectedRes.width,
        height: selectedRes.height,
        quality,
        ...(maxFileSizeMb ? { maxFileSizeMb: Number(maxFileSizeMb) } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (exportJobs === undefined) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href={`/runs/${runId}`} className={styles.back}>
        &larr; back to run
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Export</h1>
      </header>

      <div className={styles.layout}>
        <div>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Export jobs</h2>
            {exportJobs.length === 0 ? (
              <div className={styles.emptyState}>
                no exports yet — configure and start one
              </div>
            ) : (
              <div className={styles.jobList}>
                {exportJobs.map((job) => (
                  <div key={job._id} className={styles.jobItem}>
                    <div className={styles.jobHeader}>
                      <span className={styles.jobFormat}>
                        {job.format.toUpperCase()} &middot; {String(job.width)}x
                        {String(job.height)} &middot; {String(job.fps)}fps
                      </span>
                      <span className={styles.jobBadge}>{job.status}</span>
                    </div>

                    <div className={styles.jobMeta}>
                      <span>{job.quality}</span>
                      <span>{formatTime(job.createdAt)}</span>
                      {job.eta ? <span>ETA: {job.eta}</span> : null}
                      {job.fileSizeBytes ? (
                        <span>{formatFileSize(job.fileSizeBytes)}</span>
                      ) : null}
                    </div>

                    {job.status === "processing" ? (
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${String(job.progress)}%` }}
                        />
                      </div>
                    ) : null}

                    {job.status === "completed" && job.outputUrl ? (
                      <div className={styles.jobActions}>
                        <a
                          href={job.outputUrl}
                          download
                          className={styles.downloadLink}
                        >
                          Download
                        </a>
                      </div>
                    ) : null}

                    {job.status === "failed" && job.error ? (
                      <div className={styles.jobError}>{job.error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Format</h3>
            <div className={styles.selectGroup}>
              {(["mp4", "gif"] as Format[]).map((f) => (
                <button
                  key={f}
                  className={
                    format === f ? styles.selectActive : styles.selectButton
                  }
                  onClick={() => setFormat(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Quality preset</h3>
            <div className={styles.selectGroup}>
              {(["preview", "web", "high"] as Quality[]).map((q) => (
                <button
                  key={q}
                  className={
                    quality === q ? styles.selectActive : styles.selectButton
                  }
                  onClick={() => setQuality(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>FPS</h3>
            <div className={styles.selectGroup}>
              {FPS_OPTIONS.map((f) => (
                <button
                  key={f}
                  className={
                    fps === f ? styles.selectActive : styles.selectButton
                  }
                  onClick={() => setFps(f)}
                >
                  {String(f)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Resolution</h3>
            <div className={styles.selectGroup}>
              {RESOLUTION_OPTIONS.map((r, i) => (
                <button
                  key={r.label}
                  className={
                    resolution === i
                      ? styles.selectActive
                      : styles.selectButton
                  }
                  onClick={() => setResolution(i)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Max file size</h3>
            <div className={styles.fieldGroup}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>MB (optional)</label>
                <input
                  className={styles.fieldInput}
                  type="number"
                  placeholder="no limit"
                  value={maxFileSizeMb}
                  onChange={(e) => setMaxFileSizeMb(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            className={styles.buttonPrimary}
            onClick={handleExport}
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Start export"}
          </button>
        </div>
      </div>
    </div>
  );
}
