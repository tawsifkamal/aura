#!/usr/bin/env node
// Post-processing pipeline: zoom effects + cursor overlay + freeze removal
// Usage: node postprocess.mjs <input> <output> <events.json> <cursor.png> <width> <height>

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const [,, inputPath, outputPath, eventsPath, cursorPath, widthStr, heightStr] = process.argv;
const width = parseInt(widthStr);
const height = parseInt(heightStr);
const events = JSON.parse(await readFile(eventsPath, "utf8"));
const clicks = events.filter(e => e.type === "click");

if (clicks.length === 0) {
  console.log("No click events, skipping zoom/cursor. Running freeze removal only.");
  const freezes = await detectFreezes(inputPath);
  if (freezes.length > 0) {
    await removeFreezes(inputPath, outputPath, freezes);
  } else {
    await execFileAsync("ffmpeg", ["-y", "-i", inputPath, "-c", "copy", outputPath]);
  }
  process.exit(0);
}

// ── Zoom (0.4s ease-out in, 1.5s hold, 0.4s ease-in out) ────────────

function buildZoomFilter(evts) {
  const scale = 0.35, animDur = 0.4, holdDur = 1.5;
  const pulses = evts
    .filter(e => e.type === "click")
    .map(ev => {
      const t0 = ev.atMs / 1000;
      const inStart = t0 - 1.0;
      const inEnd = inStart + animDur;
      const holdEnd = inEnd + holdDur;
      const outEnd = holdEnd + animDur;
      const pIn = `((t-${inStart})/${animDur})`;
      const pOut = `((t-${holdEnd})/${animDur})`;
      return (
        `if(between(t,${inStart},${inEnd}),1+${scale}*(2*${pIn}-${pIn}*${pIn}),` +
        `if(between(t,${inEnd},${holdEnd}),${1 + scale},` +
        `if(between(t,${holdEnd},${outEnd}),1+${scale}*(1-${pOut}*${pOut}),1)))`
      );
    });
  const parts = ["1", ...pulses];
  return parts.length === 1 ? "1" : parts.reduce((a, b) => `max(${a},${b})`);
}

function buildFocusExpr(evts, axis, fallback) {
  const ordered = [...evts].sort((a, b) => a.atMs - b.atMs);
  if (!ordered.length) return String(fallback);
  let expr = String(fallback);
  for (const ev of ordered) {
    const t = Math.max(0, ev.atMs / 1000 - 1.0);
    const coord = axis === "x" ? ev.x : ev.y;
    expr = `if(gte(t,${t}),${coord},${expr})`;
  }
  return expr;
}

// ── Cursor position (ease-out movement between keyframes) ────────────

function buildCursorPosExpr(evts, axis, w, h) {
  const cl = evts.filter(e => e.type === "click").sort((a, b) => a.atMs - b.atMs);
  if (!cl.length) return axis === "x" ? String(w / 2) : String(h / 2);
  const moveDur = 0.4;
  const center = axis === "x" ? w / 2 : h / 2;
  const kfs = cl.map((c, i) => {
    const coord = axis === "x" ? c.x : c.y;
    const moveEnd = c.atMs / 1000 - 1.05;
    const moveStart = moveEnd - moveDur;
    const prev = i === 0 ? center : (axis === "x" ? cl[i - 1].x : cl[i - 1].y);
    return { moveStart, moveEnd, from: prev, to: coord };
  });
  let expr = String(kfs[kfs.length - 1].to);
  for (let i = kfs.length - 1; i >= 0; i--) {
    const k = kfs[i];
    const p = `((t-${k.moveStart})/${moveDur})`;
    const eased = `(2*${p}-${p}*${p})`;
    const lerp = `(${k.from}+(${k.to}-${k.from})*${eased})`;
    expr = `if(lt(t,${k.moveStart}),${k.from},if(lt(t,${k.moveEnd}),${lerp},${expr}))`;
  }
  return expr;
}

// ── Cursor scale (shrink + expand on click) ──────────────────────────

function buildCursorScaleExpr(evts, base) {
  let expr = String(base);
  for (const c of evts.filter(e => e.type === "click")) {
    const T = c.atMs / 1000;
    const shrinkEnd = T + 0.08;
    const expandEnd = shrinkEnd + 0.15;
    const ps = `((t-${T})/0.08)`;
    const pe = `((t-${shrinkEnd})/0.15)`;
    expr =
      `if(between(t,${T},${shrinkEnd}),${base}*(1-0.5*${ps}),` +
      `if(between(t,${shrinkEnd},${expandEnd}),${base}*(0.5+0.5*${pe}),${expr}))`;
  }
  return expr;
}

// ── Cursor output position (accounting for zoom+crop) ────────────────

function buildCursorOutExpr(cursorExpr, focusExpr, zoomExpr, dim) {
  const fz = `(${focusExpr})*(${zoomExpr})`;
  const maxCrop = `${dim}*((${zoomExpr})-1)`;
  const crop = `max(0,min(${maxCrop},${fz}-${dim}/2))`;
  return `((${cursorExpr})*(${zoomExpr})-${crop})`;
}

// ── Step 1: Zoom + cursor overlay ────────────────────────────────────

console.log("Postprocess step 1: zoom + cursor overlay...");

const zoomExpr = buildZoomFilter(events);
const fxExpr = buildFocusExpr(events, "x", width / 2);
const fyExpr = buildFocusExpr(events, "y", height / 2);

const maxCX = `${width}*((${zoomExpr})-1)`;
const maxCY = `${height}*((${zoomExpr})-1)`;
const cropX = `max(0,min(${maxCX},(${fxExpr})*(${zoomExpr})-${width}/2))`;
const cropY = `max(0,min(${maxCY},(${fyExpr})*(${zoomExpr})-${height}/2))`;

const curOX = buildCursorOutExpr(
  buildCursorPosExpr(events, "x", width, height), fxExpr, zoomExpr, width,
);
const curOY = buildCursorOutExpr(
  buildCursorPosExpr(events, "y", width, height), fyExpr, zoomExpr, height,
);

const scaleExpr = buildCursorScaleExpr(events, 32);
const firstT = Math.max(0, Math.min(...clicks.map(e => e.atMs / 1000)) - 0.5);

const filterComplex =
  `[0:v]scale=w='iw*(${zoomExpr})':h='ih*(${zoomExpr})':eval=frame,` +
  `crop=${width}:${height}:x='${cropX}':y='${cropY}'[processed];` +
  `[1:v]scale=w='${scaleExpr}':h='${scaleExpr}':eval=frame[cursor];` +
  `[processed][cursor]overlay=x='${curOX}-2':y='${curOY}-1':` +
  `enable='gte(t,${firstT})':shortest=1:format=auto,format=yuv420p[final]`;

const temp = await mkdtemp(join(tmpdir(), "aura-pp-"));
const filterFile = join(temp, "fc.txt");
await writeFile(filterFile, filterComplex, "utf8");

const zoomedPath = inputPath.replace(/\.mp4$/, "_zoomed.mp4");

try {
  await execFileAsync("ffmpeg", [
    "-y", "-i", inputPath, "-loop", "1", "-i", cursorPath,
    "-filter_complex_script", filterFile,
    "-map", "[final]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    zoomedPath,
  ], { maxBuffer: 10 * 1024 * 1024 });
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log("  Zoom + cursor done");

// ── Step 2: Freeze detection ─────────────────────────────────────────

console.log("Postprocess step 2: freeze detection...");
const freezes = await detectFreezes(zoomedPath);
console.log(`  ${freezes.length} freeze(s)`);

// ── Step 3: Freeze removal ───────────────────────────────────────────

console.log("Postprocess step 3: freeze removal...");
if (freezes.length > 0) {
  await removeFreezes(zoomedPath, outputPath, freezes);
} else {
  await execFileAsync("ffmpeg", ["-y", "-i", zoomedPath, "-c", "copy", outputPath]);
}

// Clean up intermediate
await rm(zoomedPath, { force: true });
console.log(`Done -> ${outputPath}`);

// ── Helper functions ─────────────────────────────────────────────────

async function detectFreezes(videoPath, threshold = 1.5) {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vf", `freezedetect=n=0.003:d=${threshold}`,
    "-f", "null", "-",
  ], { maxBuffer: 50 * 1024 * 1024 });

  const freezes = [];
  let currentStart = null;
  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/freeze_start:\s*([\d.]+)/);
    if (startMatch) currentStart = parseFloat(startMatch[1]);
    const endMatch = line.match(/freeze_end:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      freezes.push({ start: currentStart, end: parseFloat(endMatch[1]) });
      currentStart = null;
    }
  }
  return freezes;
}

async function removeFreezes(inp, out, freezes, keepDuration = 1.5) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "json", inp,
  ]);
  const totalDuration = parseFloat(JSON.parse(stdout).format.duration);

  const cutRanges = freezes
    .filter(f => (f.end - f.start) > keepDuration)
    .map(f => ({ start: f.start + keepDuration, end: f.end }));

  if (cutRanges.length === 0) {
    await execFileAsync("ffmpeg", ["-y", "-i", inp, "-c", "copy", out]);
    return;
  }

  const keepSegments = [];
  let cursor = 0;
  for (const cut of cutRanges) {
    if (cut.start > cursor) keepSegments.push({ start: cursor, end: cut.start });
    cursor = cut.end;
  }
  if (cursor < totalDuration) keepSegments.push({ start: cursor, end: totalDuration });

  const selectExpr = keepSegments
    .map(s => `between(t,${s.start},${s.end})`)
    .join("+");

  await execFileAsync("ffmpeg", [
    "-y", "-i", inp,
    "-vf", `select='${selectExpr}',setpts=N/FRAME_RATE/TB`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    out,
  ], { maxBuffer: 10 * 1024 * 1024 });

  const { stdout: newDur } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "json", out,
  ]);
  const newDuration = parseFloat(JSON.parse(newDur).format.duration);
  console.log(`  ${totalDuration.toFixed(1)}s -> ${newDuration.toFixed(1)}s`);
}
