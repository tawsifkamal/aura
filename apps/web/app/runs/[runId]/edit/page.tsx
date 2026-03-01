"use client";

import {
  getRun,
  listEditVersions,
  applyEdit as apiApplyEdit,
  revertEdits,
  type RunDetail,
  type EditVersion,
} from "../../../api-client";
import { useApi } from "../../../hooks";
import Link from "next/link";
import { use, useState } from "react";
import styles from "./page.module.css";

type EditType =
  | "crop"
  | "trim"
  | "split"
  | "zoom"
  | "cursor_emphasis"
  | "style_preset";
type Preset = "default" | "minimal" | "dramatic";

export default function EditPage(props: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(props.params);
  const run = useApi<RunDetail | null>(
    () => getRun(runId).catch(() => null),
    [runId],
  );
  const versions = useApi<EditVersion[]>(
    () => listEditVersions(runId),
    [runId],
  );

  const [activeTab, setActiveTab] = useState<EditType>("trim");
  const [preset, setPreset] = useState<Preset>("default");

  const [trimStart, setTrimStart] = useState("0");
  const [trimEnd, setTrimEnd] = useState("10000");
  const [cropX, setCropX] = useState("0");
  const [cropY, setCropY] = useState("0");
  const [cropW, setCropW] = useState("1280");
  const [cropH, setCropH] = useState("720");
  const [zoomIntensity, setZoomIntensity] = useState("1.5");
  const [zoomCenterX, setZoomCenterX] = useState("640");
  const [zoomCenterY, setZoomCenterY] = useState("360");
  const [zoomStart, setZoomStart] = useState("0");
  const [zoomDuration, setZoomDuration] = useState("2000");
  const [cursorTrail, setCursorTrail] = useState("5");
  const [cursorSize, setCursorSize] = useState("20");
  const [cursorSmoothing, setCursorSmoothing] = useState("0.5");
  const [splitAt, setSplitAt] = useState("5000");
  const [splitRemove, setSplitRemove] = useState<"before" | "after">(
    "before",
  );

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
        <p className={styles.loading}>Run not found</p>
      </div>
    );
  }

  async function handleApply() {
    let operation: Record<string, unknown>;

    switch (activeTab) {
      case "crop":
        operation = {
          type: "crop",
          x: Number(cropX),
          y: Number(cropY),
          width: Number(cropW),
          height: Number(cropH),
        };
        break;
      case "trim":
        operation = {
          type: "trim",
          startMs: Number(trimStart),
          endMs: Number(trimEnd),
        };
        break;
      case "split":
        operation = {
          type: "split",
          atMs: Number(splitAt),
          removeSegment: splitRemove,
        };
        break;
      case "zoom":
        operation = {
          type: "zoom",
          intensity: Number(zoomIntensity),
          centerX: Number(zoomCenterX),
          centerY: Number(zoomCenterY),
          startMs: Number(zoomStart),
          durationMs: Number(zoomDuration),
        };
        break;
      case "cursor_emphasis":
        operation = {
          type: "cursor_emphasis",
          trailLength: Number(cursorTrail),
          size: Number(cursorSize),
          smoothing: Number(cursorSmoothing),
        };
        break;
      case "style_preset":
        operation = {
          type: "style_preset",
          preset,
        };
        break;
    }

    const latestVersion = versions?.[0];
    await apiApplyEdit(runId, {
      parentVersionId: latestVersion?._id,
      operation,
    });
  }

  async function handleRevert() {
    await revertEdits(runId);
  }

  const tabs: Array<{ key: EditType; label: string }> = [
    { key: "trim", label: "Trim" },
    { key: "crop", label: "Crop" },
    { key: "split", label: "Split" },
    { key: "zoom", label: "Zoom" },
    { key: "cursor_emphasis", label: "Cursor" },
    { key: "style_preset", label: "Style" },
  ];

  const latestVideo = versions?.[0]?.videoUrl ?? run.videoUrl;

  return (
    <div className={styles.page}>
      <Link href={`/runs/${runId}`} className={styles.back}>
        &larr; back to run
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Edit Recording</h1>
      </header>

      <div className={styles.layout}>
        <div>
          <div className={styles.preview}>
            {latestVideo ? (
              <video src={latestVideo} controls />
            ) : (
              <div className={styles.previewPlaceholder}>
                no video to preview
              </div>
            )}
          </div>

          {versions && versions.length > 0 ? (
            <div style={{ marginTop: "16px" }}>
              <h3
                className={styles.panelTitle}
                style={{ marginBottom: "8px" }}
              >
                Version history
              </h3>
              <div className={styles.versions}>
                {versions.map((ver) => (
                  <div key={ver._id} className={styles.versionItem}>
                    <span>
                      v{String(ver.version)}{" "}
                      ({String(ver.operations.length)} edits)
                    </span>
                    <span className={styles.versionBadge}>{ver.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.panel}>
            <div className={styles.presetGrid}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={
                    activeTab === tab.key
                      ? styles.presetActive
                      : styles.presetButton
                  }
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>{activeTab}</h3>
            <div className={styles.fieldGroup}>
              {activeTab === "trim" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Start (ms)</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={trimStart}
                      onChange={(e) => setTrimStart(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>End (ms)</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {activeTab === "crop" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>X</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={cropX}
                      onChange={(e) => setCropX(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Y</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={cropY}
                      onChange={(e) => setCropY(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Width</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={cropW}
                      onChange={(e) => setCropW(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Height</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={cropH}
                      onChange={(e) => setCropH(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {activeTab === "split" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Split at (ms)</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={splitAt}
                      onChange={(e) => setSplitAt(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Remove</label>
                    <div className={styles.buttonRow}>
                      <button
                        className={
                          splitRemove === "before"
                            ? styles.presetActive
                            : styles.presetButton
                        }
                        onClick={() => setSplitRemove("before")}
                      >
                        Before
                      </button>
                      <button
                        className={
                          splitRemove === "after"
                            ? styles.presetActive
                            : styles.presetButton
                        }
                        onClick={() => setSplitRemove("after")}
                      >
                        After
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              {activeTab === "zoom" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Intensity</label>
                    <input
                      className={styles.fieldRange}
                      type="range"
                      min="1"
                      max="3"
                      step="0.1"
                      value={zoomIntensity}
                      onChange={(e) => setZoomIntensity(e.target.value)}
                    />
                    <span className={styles.fieldLabel}>
                      {zoomIntensity}x
                    </span>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Center X</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={zoomCenterX}
                      onChange={(e) => setZoomCenterX(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Center Y</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={zoomCenterY}
                      onChange={(e) => setZoomCenterY(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Start (ms)</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={zoomStart}
                      onChange={(e) => setZoomStart(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Duration (ms)
                    </label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      value={zoomDuration}
                      onChange={(e) => setZoomDuration(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {activeTab === "cursor_emphasis" ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Trail length</label>
                    <input
                      className={styles.fieldRange}
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={cursorTrail}
                      onChange={(e) => setCursorTrail(e.target.value)}
                    />
                    <span className={styles.fieldLabel}>{cursorTrail}</span>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Size</label>
                    <input
                      className={styles.fieldRange}
                      type="range"
                      min="8"
                      max="48"
                      step="2"
                      value={cursorSize}
                      onChange={(e) => setCursorSize(e.target.value)}
                    />
                    <span className={styles.fieldLabel}>{cursorSize}px</span>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Smoothing</label>
                    <input
                      className={styles.fieldRange}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={cursorSmoothing}
                      onChange={(e) => setCursorSmoothing(e.target.value)}
                    />
                    <span className={styles.fieldLabel}>
                      {cursorSmoothing}
                    </span>
                  </div>
                </>
              ) : null}

              {activeTab === "style_preset" ? (
                <div className={styles.presetGrid}>
                  {(["default", "minimal", "dramatic"] as Preset[]).map(
                    (p) => (
                      <button
                        key={p}
                        className={
                          preset === p
                            ? styles.presetActive
                            : styles.presetButton
                        }
                        onClick={() => setPreset(p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.buttonRow}>
            <button className={styles.buttonPrimary} onClick={handleApply}>
              Apply
            </button>
            <button className={styles.buttonDanger} onClick={handleRevert}>
              Revert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
