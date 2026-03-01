import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAWSPipelineConfig,
  isAWSAvailable,
  buildMediaConvertJobSpec,
  estimateCost,
  buildLocalFallbackCommand,
  shouldRetry,
  buildDeadLetterMessage,
  buildTelemetry,
} from "./aws-pipeline.js";
import type {
  AWSPipelineConfig,
  TranscodeJobRequest,
  TranscodeJobResult,
} from "./aws-pipeline.js";

beforeEach(() => {
  vi.unstubAllEnvs();
});

const mockConfig: AWSPipelineConfig = {
  region: "us-east-1",
  mediaConvertEndpoint: "https://abc123.mediaconvert.us-east-1.amazonaws.com",
  inputBucket: "aura-input",
  outputBucket: "aura-output",
  roleArn: "arn:aws:iam::123456789:role/MediaConvert",
  queueArn: "arn:aws:mediaconvert:us-east-1:123456789:queues/Default",
};

const mockRequest: TranscodeJobRequest = {
  idempotencyKey: "test-idem-key",
  inputKey: "videos/input.mp4",
  outputKeyPrefix: "exports/output",
  format: "mp4",
  fps: 30,
  width: 1920,
  height: 1080,
  quality: "web",
  priority: "normal",
  hwAccelerated: false,
};

describe("getAWSPipelineConfig", () => {
  it("returns null when required env vars are missing", () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_MEDIACONVERT_ENDPOINT;
    expect(getAWSPipelineConfig()).toBeNull();
  });

  it("returns config when all required env vars are set", () => {
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_MEDIACONVERT_ENDPOINT = "https://mc.example.com";
    process.env.AWS_VIDEO_INPUT_BUCKET = "input";
    process.env.AWS_VIDEO_OUTPUT_BUCKET = "output";
    process.env.AWS_MEDIACONVERT_ROLE_ARN = "arn:role";
    process.env.AWS_MEDIACONVERT_QUEUE_ARN = "arn:queue";

    const config = getAWSPipelineConfig();
    expect(config).not.toBeNull();
    expect(config?.region).toBe("us-east-1");

    // Cleanup
    delete process.env.AWS_REGION;
    delete process.env.AWS_MEDIACONVERT_ENDPOINT;
    delete process.env.AWS_VIDEO_INPUT_BUCKET;
    delete process.env.AWS_VIDEO_OUTPUT_BUCKET;
    delete process.env.AWS_MEDIACONVERT_ROLE_ARN;
    delete process.env.AWS_MEDIACONVERT_QUEUE_ARN;
  });
});

describe("isAWSAvailable", () => {
  it("returns false when config is null", () => {
    delete process.env.AWS_REGION;
    expect(isAWSAvailable()).toBe(false);
  });
});

describe("buildMediaConvertJobSpec", () => {
  it("builds a valid job spec for MP4", () => {
    const spec = buildMediaConvertJobSpec(mockConfig, mockRequest);
    expect(spec.Role).toBe(mockConfig.roleArn);
    expect(spec.Queue).toBe(mockConfig.queueArn);
    expect(spec.IdempotencyToken).toBe(mockRequest.idempotencyKey);
    expect(spec.Settings).toBeDefined();
  });

  it("builds a valid job spec for GIF", () => {
    const gifRequest: TranscodeJobRequest = {
      ...mockRequest,
      format: "gif",
      fps: 15,
    };
    const spec = buildMediaConvertJobSpec(mockConfig, gifRequest);
    expect(spec).toBeDefined();
    // GIF should use FrameCaptureSettings
    const settings = spec.Settings as Record<string, unknown>;
    expect(settings).toBeDefined();
  });

  it("sets priority based on request", () => {
    const highPriority: TranscodeJobRequest = {
      ...mockRequest,
      priority: "high",
    };
    const spec = buildMediaConvertJobSpec(mockConfig, highPriority);
    expect(spec.Priority).toBe(1);

    const lowPriority: TranscodeJobRequest = {
      ...mockRequest,
      priority: "low",
    };
    const lowSpec = buildMediaConvertJobSpec(mockConfig, lowPriority);
    expect(lowSpec.Priority).toBe(-1);
  });

  it("includes metadata in UserMetadata", () => {
    const withMeta: TranscodeJobRequest = {
      ...mockRequest,
      metadata: { customField: "value" },
    };
    const spec = buildMediaConvertJobSpec(mockConfig, withMeta);
    const meta = spec.UserMetadata as Record<string, string>;
    expect(meta.customField).toBe("value");
    expect(meta.idempotencyKey).toBe(mockRequest.idempotencyKey);
  });
});

describe("estimateCost", () => {
  it("estimates cost for HD web quality", () => {
    const cost = estimateCost(1920, 1080, 60, "web", false);
    expect(cost.transcodeMinutes).toBe(1);
    expect(cost.estimatedCostUsd).toBeGreaterThan(0);
    expect(cost.tier).toBe("basic");
  });

  it("estimates higher cost for high quality + HW acceleration", () => {
    const regular = estimateCost(1920, 1080, 60, "web", false);
    const premium = estimateCost(1920, 1080, 60, "high", true);
    expect(premium.estimatedCostUsd).toBeGreaterThan(regular.estimatedCostUsd);
    expect(premium.tier).toBe("professional");
  });

  it("scales cost with duration", () => {
    const short = estimateCost(1280, 720, 30, "web", false);
    const long = estimateCost(1280, 720, 300, "web", false);
    expect(long.estimatedCostUsd).toBeGreaterThan(short.estimatedCostUsd);
  });
});

describe("buildLocalFallbackCommand", () => {
  it("generates FFmpeg command for MP4", () => {
    const cmd = buildLocalFallbackCommand(
      mockRequest,
      "/tmp/input.mp4",
      "/tmp/output.mp4",
    );
    expect(cmd[0]).toBe("ffmpeg");
    expect(cmd).toContain("-i");
    expect(cmd).toContain("/tmp/input.mp4");
    expect(cmd).toContain("/tmp/output.mp4");
    expect(cmd).toContain("-movflags");
  });

  it("generates FFmpeg command for GIF", () => {
    const gifRequest: TranscodeJobRequest = {
      ...mockRequest,
      format: "gif",
      fps: 15,
    };
    const cmd = buildLocalFallbackCommand(
      gifRequest,
      "/tmp/input.mp4",
      "/tmp/output.gif",
    );
    expect(cmd[0]).toBe("ffmpeg");
    expect(cmd.join(" ")).toContain("palettegen");
    expect(cmd.join(" ")).toContain("paletteuse");
  });
});

describe("shouldRetry", () => {
  const failedResult: TranscodeJobResult = {
    jobId: "job-1",
    idempotencyKey: "key-1",
    status: "failed",
    progress: 0,
    error: "Internal service error",
  };

  it("allows retry on transient errors", () => {
    expect(shouldRetry(failedResult, 0)).toBe(true);
    expect(shouldRetry(failedResult, 2)).toBe(true);
  });

  it("stops retrying at max attempts", () => {
    expect(shouldRetry(failedResult, 3)).toBe(false);
  });

  it("does not retry on client errors", () => {
    const clientError: TranscodeJobResult = {
      ...failedResult,
      error: "InvalidInputException: bad format",
    };
    expect(shouldRetry(clientError, 0)).toBe(false);
  });

  it("does not retry non-failed jobs", () => {
    const completed: TranscodeJobResult = {
      ...failedResult,
      status: "completed",
    };
    expect(shouldRetry(completed, 0)).toBe(false);
  });
});

describe("buildDeadLetterMessage", () => {
  it("builds message with all required fields", () => {
    const result: TranscodeJobResult = {
      jobId: "job-dead",
      idempotencyKey: "key-dead",
      status: "failed",
      progress: 50,
      error: "Timeout",
    };
    const dlq = buildDeadLetterMessage(mockRequest, result, 3);
    expect(dlq.jobId).toBe("job-dead");
    expect(dlq.error).toBe("Timeout");
    expect(dlq.retryCount).toBe(3);
    expect(dlq.originalRequest).toBe(mockRequest);
    expect(dlq.failedAt).toBeGreaterThan(0);
  });
});

describe("buildTelemetry", () => {
  it("captures telemetry with cost estimate", () => {
    const result: TranscodeJobResult = {
      jobId: "job-telem",
      idempotencyKey: "key-telem",
      status: "completed",
      progress: 100,
      durationMs: 30000,
    };
    const telemetry = buildTelemetry(mockRequest, result, 5_000_000, 0);
    expect(telemetry.jobId).toBe("job-telem");
    expect(telemetry.inputSizeBytes).toBe(5_000_000);
    expect(telemetry.hwAccelerated).toBe(false);
    expect(telemetry.retryCount).toBe(0);
    expect(telemetry.costEstimate.estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });
});
