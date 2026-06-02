/**
 * Image queue types — async image-generation channel pool & runtime stats.
 *
 * Mirrors backend types in internal/config/config.go (ImageChannel,
 * ImageQueueConfig) and internal/imagequeue/stats.go (ChannelStat).
 */

export type ImageChannelType = 'gemini_native' | 'openai_compatible';

export interface ImageChannel {
  id: string;
  group: string;
  type: ImageChannelType;
  'base-url': string;
  'api-key': string;
  models: string[];
  'max-rpm': number;
  'proxy-url'?: string;
  headers?: Record<string, string>;
}

export interface ImageQueueGroup {
  name: string;
  'worker-concurrency': number;
  'image-models': string[];
}

export interface ImageQueueConfig {
  enable: boolean;
  'redis-addr': string;
  'redis-db': number;
  'redis-password'?: string;
  'key-prefix': string;
  'max-wait-seconds': number;
  groups: ImageQueueGroup[];
}

export interface ImageChannelStat {
  channel_id: string;
  group: string;
  type: ImageChannelType;
  max_rpm: number;
  current_rpm: number;
  bucket: string;
  /** True when the channel is currently cooling down due to recent upstream
   * failures (429 / 5xx). Set by the worker's retry loop. */
  cooling: boolean;
  /** Consecutive failure count on this channel since the last success. Drives
   * exponential cooldown TTL on the backend. */
  consecutive_fails: number;
}

export interface ImageQueueStatsResponse {
  enabled: boolean;
  channels: ImageChannelStat[];
}

export interface ImageQueueGroupSummary {
  name: string;
  worker_concurrency: number;
  image_models: string[];
  channel_count: number;
}

export interface ImageQueueGroupsResponse {
  enabled: boolean;
  groups: ImageQueueGroupSummary[];
}
