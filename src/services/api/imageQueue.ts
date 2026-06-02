/**
 * Image queue management API.
 *
 * Mirrors backend routes mounted under /v0/management:
 *   GET    /image-channels
 *   PUT    /image-channels
 *   PATCH  /image-channels
 *   DELETE /image-channels
 *   GET    /image-queue/config
 *   PUT    /image-queue/config
 *   GET    /image-queue/stats
 */

import { apiClient } from './client';
import type {
  ImageChannel,
  ImageQueueConfig,
  ImageQueueGroupsResponse,
  ImageQueueStatsResponse,
} from '@/types';

interface ListChannelsResponse {
  'image-channels': ImageChannel[];
}

interface QueueConfigResponse {
  'image-queue': ImageQueueConfig;
}

type PatchTarget = { id: string } | { index: number };

const buildDeleteQuery = (target: PatchTarget): string => {
  if ('id' in target) {
    return `?id=${encodeURIComponent(target.id)}`;
  }
  return `?index=${target.index}`;
};

export const imageQueueApi = {
  async listChannels(): Promise<ImageChannel[]> {
    const data = await apiClient.get<ListChannelsResponse>('/image-channels');
    return data?.['image-channels'] ?? [];
  },

  async replaceChannels(items: ImageChannel[]): Promise<unknown> {
    return apiClient.put('/image-channels', items);
  },

  async patchChannel(target: PatchTarget, value: Partial<ImageChannel>): Promise<unknown> {
    return apiClient.patch('/image-channels', { ...target, value });
  },

  async deleteChannel(target: PatchTarget): Promise<unknown> {
    return apiClient.delete(`/image-channels${buildDeleteQuery(target)}`);
  },

  async getQueueConfig(): Promise<ImageQueueConfig | null> {
    const data = await apiClient.get<QueueConfigResponse>('/image-queue/config');
    return data?.['image-queue'] ?? null;
  },

  async putQueueConfig(cfg: ImageQueueConfig): Promise<unknown> {
    return apiClient.put('/image-queue/config', cfg);
  },

  async getStats(): Promise<ImageQueueStatsResponse> {
    return apiClient.get<ImageQueueStatsResponse>('/image-queue/stats');
  },

  async getGroups(): Promise<ImageQueueGroupsResponse> {
    return apiClient.get<ImageQueueGroupsResponse>('/image-queue/groups');
  },
};
