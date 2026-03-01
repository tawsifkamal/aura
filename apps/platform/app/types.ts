export interface Run {
  _id: string;
  _creationTime: number;
  timestamp: number;
  branch?: string;
  pr?: number;
  commitSha?: string;
  summary: string;
  videoStorageId?: string;
  status: "queued" | "running" | "uploading" | "completed" | "failed";
  source: "skill" | "pr";
  screenshotStorageIds?: string[];
  routesTested?: string[];
  durationMs?: number;
  error?: string;
  traceId?: string;
}

export interface RunWithVideo extends Run {
  videoUrl: string | null;
}

export interface RunDetail extends Run {
  videoUrl: string | null;
  screenshotUrls: string[];
}

export interface ExportJob {
  _id: string;
  _creationTime: number;
  runId: string;
  editVersionId?: string;
  format: "mp4" | "gif";
  fps: number;
  width: number;
  height: number;
  quality: "web" | "high" | "preview";
  maxFileSizeMb?: number;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  eta?: string;
  outputStorageId?: string;
  fileSizeBytes?: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
  outputUrl: string | null;
}
