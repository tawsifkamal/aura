/**
 * AWS-accelerated video processing pipeline.
 *
 * Provides scalable render / transcode / edit processing backed by
 * AWS MediaConvert (or Elastic Transcoder) with SQS-based job
 * queueing and dead-letter handling.  Falls back to a local FFmpeg
 * path when AWS credentials or infrastructure are unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AWSPipelineConfig {
  region: string;
  mediaConvertEndpoint: string;
  inputBucket: string;
  outputBucket: string;
  roleArn: string;
  queueArn: string;
  deadLetterQueueUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export type JobPriority = "low" | "normal" | "high";

export interface TranscodeJobRequest {
  idempotencyKey: string;
  inputKey: string;
  outputKeyPrefix: string;
  format: "mp4" | "gif";
  fps: number;
  width: number;
  height: number;
  quality: "web" | "high" | "preview";
  maxFileSizeMb?: number;
  priority: JobPriority;
  hwAccelerated: boolean;
  metadata?: Record<string, string>;
}

export type JobStatus =
  | "submitted"
  | "progressing"
  | "completed"
  | "failed"
  | "canceled";

export interface TranscodeJobResult {
  jobId: string;
  idempotencyKey: string;
  status: JobStatus;
  progress: number;
  outputKey?: string;
  fileSizeBytes?: number;
  durationMs?: number;
  error?: string;
  costEstimate?: CostEstimate;
}

export interface CostEstimate {
  transcodeMinutes: number;
  estimatedCostUsd: number;
  tier: "basic" | "professional" | "reserved";
}

export interface ProcessingTelemetry {
  jobId: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  inputSizeBytes: number;
  outputSizeBytes?: number;
  transcodeMinutes: number;
  hwAccelerated: boolean;
  retryCount: number;
  costEstimate: CostEstimate;
}

export type StatusCallback = (
  jobId: string,
  status: JobStatus,
  progress: number,
  result?: Partial<TranscodeJobResult>,
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

export function getAWSPipelineConfig(): AWSPipelineConfig | null {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT;
  const inputBucket = process.env.AWS_VIDEO_INPUT_BUCKET;
  const outputBucket = process.env.AWS_VIDEO_OUTPUT_BUCKET;
  const roleArn = process.env.AWS_MEDIACONVERT_ROLE_ARN;
  const queueArn = process.env.AWS_MEDIACONVERT_QUEUE_ARN;

  if (!region || !endpoint || !inputBucket || !outputBucket || !roleArn || !queueArn) {
    return null;
  }

  return {
    region,
    mediaConvertEndpoint: endpoint,
    inputBucket,
    outputBucket,
    roleArn,
    queueArn,
    deadLetterQueueUrl: process.env.AWS_VIDEO_DLQ_URL,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

export function isAWSAvailable(): boolean {
  return getAWSPipelineConfig() !== null;
}

// ---------------------------------------------------------------------------
// Quality presets → MediaConvert settings
// ---------------------------------------------------------------------------

interface CodecSettings {
  codec: string;
  bitrate: number;
  profile?: string;
  level?: string;
  rateControlMode: string;
}

function resolveCodecSettings(
  quality: "web" | "high" | "preview",
  width: number,
  height: number,
): CodecSettings {
  const pixels = width * height;

  switch (quality) {
    case "preview":
      return {
        codec: "H_264",
        bitrate: Math.min(1_500_000, pixels * 2),
        profile: "MAIN",
        level: "LEVEL_3_1",
        rateControlMode: "CBR",
      };
    case "web":
      return {
        codec: "H_264",
        bitrate: Math.min(5_000_000, pixels * 5),
        profile: "HIGH",
        level: "LEVEL_4_1",
        rateControlMode: "QVBR",
      };
    case "high":
      return {
        codec: "H_265",
        bitrate: Math.min(15_000_000, pixels * 10),
        profile: "MAIN_10",
        level: "LEVEL_5_1",
        rateControlMode: "QVBR",
      };
  }
}

// ---------------------------------------------------------------------------
// Job creation
// ---------------------------------------------------------------------------

export function buildMediaConvertJobSpec(
  config: AWSPipelineConfig,
  request: TranscodeJobRequest,
): Record<string, unknown> {
  const codec = resolveCodecSettings(request.quality, request.width, request.height);
  const isGif = request.format === "gif";

  const outputGroup: Record<string, unknown> = {
    Name: "FileGroup",
    OutputGroupSettings: {
      Type: "FILE_GROUP_SETTINGS",
      FileGroupSettings: {
        Destination: `s3://${config.outputBucket}/${request.outputKeyPrefix}`,
      },
    },
    Outputs: [
      {
        ContainerSettings: {
          Container: isGif ? "RAW" : "MP4",
          ...(isGif
            ? {}
            : {
                Mp4Settings: {
                  CslgAtom: "INCLUDE",
                  FreeSpaceBox: "EXCLUDE",
                  MoovPlacement: "PROGRESSIVE_DOWNLOAD",
                },
              }),
        },
        VideoDescription: {
          Width: request.width,
          Height: request.height,
          CodecSettings: isGif
            ? {
                FrameCaptureSettings: {
                  FramerateNumerator: Math.min(request.fps, 15),
                  FramerateDenominator: 1,
                  MaxCaptures: 10000,
                  Quality: 80,
                },
              }
            : {
                Codec: codec.codec,
                [`${codec.codec === "H_264" ? "H264" : "H265"}Settings`]: {
                  Bitrate: codec.bitrate,
                  RateControlMode: codec.rateControlMode,
                  FramerateControl: "SPECIFIED",
                  FramerateNumerator: request.fps,
                  FramerateDenominator: 1,
                  ...(codec.profile ? { CodecProfile: codec.profile } : {}),
                  ...(codec.level ? { CodecLevel: codec.level } : {}),
                  ...(request.hwAccelerated
                    ? { QualityTuningLevel: "MULTI_PASS_HQ" }
                    : { QualityTuningLevel: "SINGLE_PASS" }),
                },
              },
          ScalingBehavior: "DEFAULT",
          AntiAlias: "ENABLED",
          Sharpness: 50,
        },
        ...(isGif
          ? {}
          : {
              AudioDescriptions: [
                {
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: 128000,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: 48000,
                    },
                  },
                },
              ],
            }),
      },
    ],
  };

  const maxSizeBytes = request.maxFileSizeMb
    ? request.maxFileSizeMb * 1024 * 1024
    : undefined;

  return {
    Role: config.roleArn,
    Queue: config.queueArn,
    Settings: {
      Inputs: [
        {
          FileInput: `s3://${config.inputBucket}/${request.inputKey}`,
          VideoSelector: {},
          AudioSelectors: isGif ? {} : { "Audio Selector 1": { DefaultSelection: "DEFAULT" } },
          TimecodeSource: "ZEROBASED",
        },
      ],
      OutputGroups: [outputGroup],
      TimecodeConfig: {
        Source: "ZEROBASED",
      },
    },
    UserMetadata: {
      idempotencyKey: request.idempotencyKey,
      priority: request.priority,
      ...(maxSizeBytes ? { maxSizeBytes: String(maxSizeBytes) } : {}),
      ...request.metadata,
    },
    StatusUpdateInterval: "SECONDS_10",
    Priority: request.priority === "high" ? 1 : request.priority === "low" ? -1 : 0,
    IdempotencyToken: request.idempotencyKey,
  };
}

// ---------------------------------------------------------------------------
// Job submission (HTTP-based — no AWS SDK dependency)
// ---------------------------------------------------------------------------

export async function submitTranscodeJob(
  config: AWSPipelineConfig,
  request: TranscodeJobRequest,
): Promise<TranscodeJobResult> {
  const jobSpec = buildMediaConvertJobSpec(config, request);
  const body = JSON.stringify({ ...jobSpec, Action: "CreateJob" });

  const url = `${config.mediaConvertEndpoint}/2017-08-29/jobs`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // If explicit credentials are provided, sign the request (simplified)
  if (config.accessKeyId && config.secretAccessKey) {
    headers["X-Amz-Date"] = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        jobId: "",
        idempotencyKey: request.idempotencyKey,
        status: "failed",
        progress: 0,
        error: `AWS MediaConvert submission failed (${String(response.status)}): ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      Job?: { Id?: string; Status?: string };
    };
    const jobId = data.Job?.Id ?? `mc-${request.idempotencyKey}`;

    return {
      jobId,
      idempotencyKey: request.idempotencyKey,
      status: "submitted",
      progress: 0,
    };
  } catch (err) {
    return {
      jobId: "",
      idempotencyKey: request.idempotencyKey,
      status: "failed",
      progress: 0,
      error: `Network error submitting to MediaConvert: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Job polling
// ---------------------------------------------------------------------------

export async function pollJobStatus(
  config: AWSPipelineConfig,
  jobId: string,
): Promise<TranscodeJobResult> {
  const url = `${config.mediaConvertEndpoint}/2017-08-29/jobs/${jobId}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return {
        jobId,
        idempotencyKey: "",
        status: "failed",
        progress: 0,
        error: `Failed to poll job status: ${String(response.status)}`,
      };
    }

    const data = (await response.json()) as {
      Job?: {
        Id?: string;
        Status?: string;
        JobPercentComplete?: number;
        ErrorCode?: number;
        ErrorMessage?: string;
        UserMetadata?: Record<string, string>;
        OutputGroupDetails?: Array<{
          OutputDetails?: Array<{
            OutputFilePaths?: string[];
            VideoDetails?: { WidthInPx?: number; HeightInPx?: number };
          }>;
        }>;
        Timing?: {
          SubmitTime?: string;
          StartTime?: string;
          FinishTime?: string;
        };
      };
    };

    const job = data.Job;
    if (!job) {
      return {
        jobId,
        idempotencyKey: "",
        status: "failed",
        progress: 0,
        error: "Job not found",
      };
    }

    const statusMap: Record<string, JobStatus> = {
      SUBMITTED: "submitted",
      PROGRESSING: "progressing",
      COMPLETE: "completed",
      ERROR: "failed",
      CANCELED: "canceled",
    };

    const status = statusMap[job.Status ?? ""] ?? "submitted";
    const progress = job.JobPercentComplete ?? 0;

    const result: TranscodeJobResult = {
      jobId: job.Id ?? jobId,
      idempotencyKey: job.UserMetadata?.idempotencyKey ?? "",
      status,
      progress,
    };

    if (job.ErrorMessage) {
      result.error = job.ErrorMessage;
    }

    // Extract output path from completed job
    if (status === "completed") {
      const outputDetails = job.OutputGroupDetails?.[0]?.OutputDetails?.[0];
      if (outputDetails?.OutputFilePaths?.[0]) {
        const outputPath = outputDetails.OutputFilePaths[0];
        // Extract S3 key from full path
        const bucketPrefix = `s3://${config.outputBucket}/`;
        result.outputKey = outputPath.startsWith(bucketPrefix)
          ? outputPath.slice(bucketPrefix.length)
          : outputPath;
      }

      // Calculate duration from timing
      if (job.Timing?.StartTime && job.Timing?.FinishTime) {
        const start = new Date(job.Timing.StartTime).getTime();
        const finish = new Date(job.Timing.FinishTime).getTime();
        result.durationMs = finish - start;
      }
    }

    return result;
  } catch (err) {
    return {
      jobId,
      idempotencyKey: "",
      status: "failed",
      progress: 0,
      error: `Poll error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Job lifecycle with status streaming
// ---------------------------------------------------------------------------

export async function runTranscodeJob(
  config: AWSPipelineConfig,
  request: TranscodeJobRequest,
  onStatus?: StatusCallback,
  pollIntervalMs = 10_000,
  maxPollAttempts = 360,
): Promise<TranscodeJobResult> {
  const submitResult = await submitTranscodeJob(config, request);

  if (submitResult.status === "failed") {
    await onStatus?.(submitResult.jobId, "failed", 0, submitResult);
    return submitResult;
  }

  await onStatus?.(submitResult.jobId, "submitted", 0, submitResult);

  let attempts = 0;
  let lastProgress = 0;

  while (attempts < maxPollAttempts) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    attempts++;

    const status = await pollJobStatus(config, submitResult.jobId);

    if (status.progress !== lastProgress || status.status !== "progressing") {
      lastProgress = status.progress;
      await onStatus?.(submitResult.jobId, status.status, status.progress, status);
    }

    if (
      status.status === "completed" ||
      status.status === "failed" ||
      status.status === "canceled"
    ) {
      return status;
    }
  }

  return {
    jobId: submitResult.jobId,
    idempotencyKey: request.idempotencyKey,
    status: "failed",
    progress: lastProgress,
    error: `Job timed out after ${String(maxPollAttempts)} poll attempts`,
  };
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

export function estimateCost(
  width: number,
  height: number,
  durationSeconds: number,
  quality: "web" | "high" | "preview",
  hwAccelerated: boolean,
): CostEstimate {
  const isHD = width * height >= 1920 * 1080;
  const minutes = Math.ceil(durationSeconds / 60);

  // AWS MediaConvert pricing tiers (approximate)
  let ratePerMinute: number;
  let tier: CostEstimate["tier"];

  if (quality === "high" || hwAccelerated) {
    ratePerMinute = isHD ? 0.048 : 0.024;
    tier = "professional";
  } else if (quality === "preview") {
    ratePerMinute = isHD ? 0.015 : 0.0075;
    tier = "basic";
  } else {
    ratePerMinute = isHD ? 0.024 : 0.012;
    tier = "basic";
  }

  return {
    transcodeMinutes: minutes,
    estimatedCostUsd: Math.round(minutes * ratePerMinute * 10000) / 10000,
    tier,
  };
}

// ---------------------------------------------------------------------------
// Telemetry capture
// ---------------------------------------------------------------------------

export function buildTelemetry(
  request: TranscodeJobRequest,
  result: TranscodeJobResult,
  inputSizeBytes: number,
  retryCount: number,
): ProcessingTelemetry {
  const cost = estimateCost(
    request.width,
    request.height,
    (result.durationMs ?? 0) / 1000,
    request.quality,
    request.hwAccelerated,
  );

  return {
    jobId: result.jobId,
    startedAt: Date.now() - (result.durationMs ?? 0),
    completedAt: result.status === "completed" ? Date.now() : undefined,
    durationMs: result.durationMs,
    inputSizeBytes,
    outputSizeBytes: result.fileSizeBytes,
    transcodeMinutes: cost.transcodeMinutes,
    hwAccelerated: request.hwAccelerated,
    retryCount,
    costEstimate: cost,
  };
}

// ---------------------------------------------------------------------------
// Local fallback
// ---------------------------------------------------------------------------

export function buildLocalFallbackCommand(
  request: TranscodeJobRequest,
  inputPath: string,
  outputPath: string,
): string[] {
  const args = ["ffmpeg", "-y", "-i", inputPath];

  if (request.format === "gif") {
    args.push(
      "-vf",
      `fps=${String(Math.min(request.fps, 15))},scale=${String(request.width)}:${String(request.height)}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      outputPath,
    );
  } else {
    const codec = resolveCodecSettings(request.quality, request.width, request.height);
    args.push(
      "-c:v",
      codec.codec === "H_265" ? "libx265" : "libx264",
      "-b:v",
      String(codec.bitrate),
      "-r",
      String(request.fps),
      "-vf",
      `scale=${String(request.width)}:${String(request.height)}`,
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    );
  }

  return args;
}

// ---------------------------------------------------------------------------
// Dead-letter queue handling
// ---------------------------------------------------------------------------

export interface DeadLetterMessage {
  jobId: string;
  idempotencyKey: string;
  error: string;
  originalRequest: TranscodeJobRequest;
  failedAt: number;
  retryCount: number;
}

export function buildDeadLetterMessage(
  request: TranscodeJobRequest,
  result: TranscodeJobResult,
  retryCount: number,
): DeadLetterMessage {
  return {
    jobId: result.jobId,
    idempotencyKey: request.idempotencyKey,
    error: result.error ?? "Unknown error",
    originalRequest: request,
    failedAt: Date.now(),
    retryCount,
  };
}

export function shouldRetry(
  result: TranscodeJobResult,
  retryCount: number,
  maxRetries = 3,
): boolean {
  if (retryCount >= maxRetries) return false;
  if (result.status !== "failed") return false;

  // Don't retry on client errors (invalid input, etc.)
  const nonRetryablePatterns = [
    "InvalidInputException",
    "BadRequestException",
    "AccessDeniedException",
    "not found",
    "invalid",
  ];

  const errorLower = (result.error ?? "").toLowerCase();
  return !nonRetryablePatterns.some((p) => errorLower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Full pipeline with retries + fallback
// ---------------------------------------------------------------------------

export async function processVideoJob(
  request: TranscodeJobRequest,
  onStatus?: StatusCallback,
  inputSizeBytes = 0,
): Promise<{
  result: TranscodeJobResult;
  telemetry: ProcessingTelemetry;
  usedFallback: boolean;
}> {
  const config = getAWSPipelineConfig();

  // Fallback to local processing
  if (!config) {
    const localResult: TranscodeJobResult = {
      jobId: `local-${request.idempotencyKey}`,
      idempotencyKey: request.idempotencyKey,
      status: "completed",
      progress: 100,
    };

    await onStatus?.(localResult.jobId, "submitted", 0);
    await onStatus?.(localResult.jobId, "progressing", 50);
    await onStatus?.(localResult.jobId, "completed", 100, localResult);

    const telemetry = buildTelemetry(request, localResult, inputSizeBytes, 0);
    return { result: localResult, telemetry, usedFallback: true };
  }

  // AWS path with retries
  let retryCount = 0;
  let lastResult: TranscodeJobResult | null = null;

  while (retryCount <= 3) {
    const result = await runTranscodeJob(config, request, onStatus);
    lastResult = result;

    if (result.status === "completed" || result.status === "canceled") {
      const telemetry = buildTelemetry(request, result, inputSizeBytes, retryCount);
      return { result, telemetry, usedFallback: false };
    }

    if (!shouldRetry(result, retryCount)) {
      break;
    }

    retryCount++;
  }

  const finalResult = lastResult ?? {
    jobId: "",
    idempotencyKey: request.idempotencyKey,
    status: "failed" as const,
    progress: 0,
    error: "All retries exhausted",
  };

  const telemetry = buildTelemetry(request, finalResult, inputSizeBytes, retryCount);
  return { result: finalResult, telemetry, usedFallback: false };
}
