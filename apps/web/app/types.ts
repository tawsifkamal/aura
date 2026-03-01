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
