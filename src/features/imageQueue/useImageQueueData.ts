/**
 * Image queue data hook.
 *
 * Owns the channels list, queue runtime config, and live per-channel RPM
 * stats. Polls /image-queue/stats every 5 seconds while the tab is mounted
 * and the document is visible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { imageQueueApi } from '@/services/api/imageQueue';
import type {
  ImageChannel,
  ImageChannelStat,
  ImageQueueConfig,
  ImageQueueGroupSummary,
} from '@/types';

const STATS_POLL_MS = 2000;

export interface UseImageQueueDataResult {
  channels: ImageChannel[];
  queueConfig: ImageQueueConfig | null;
  groups: ImageQueueGroupSummary[];
  stats: Record<string, ImageChannelStat>;
  /**
   * Wall-clock timestamp (ms) of the most recent successful stats refresh.
   * 0 means stats have not landed yet. The UI uses this to show "updated Xs
   * ago" so users can confirm the live poll is alive.
   */
  statsUpdatedAt: number;
  enabled: boolean | null;
  loading: boolean;
  saving: boolean;
  error: string;
  refresh: () => Promise<void>;
  createChannel: (channel: ImageChannel) => Promise<void>;
  updateChannel: (id: string, value: Partial<ImageChannel>) => Promise<void>;
  deleteChannel: (id: string) => Promise<void>;
  saveQueueConfig: (cfg: ImageQueueConfig) => Promise<void>;
}

export function useImageQueueData(active: boolean): UseImageQueueDataResult {
  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [queueConfig, setQueueConfig] = useState<ImageQueueConfig | null>(null);
  const [groups, setGroups] = useState<ImageQueueGroupSummary[]>([]);
  const [stats, setStats] = useState<Record<string, ImageChannelStat>>({});
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<number>(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Drop stale responses if the user clicks refresh multiple times in flight.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const [list, cfg, groupsResp, statsResp] = await Promise.all([
        imageQueueApi.listChannels(),
        imageQueueApi.getQueueConfig(),
        imageQueueApi.getGroups(),
        imageQueueApi.getStats(),
      ]);
      if (id !== requestIdRef.current) return;
      setChannels(list);
      setQueueConfig(cfg);
      setGroups(groupsResp.groups ?? []);
      setEnabled(statsResp.enabled);
      const next: Record<string, ImageChannelStat> = {};
      statsResp.channels.forEach((s) => {
        next[s.channel_id] = s;
      });
      setStats(next);
      setStatsUpdatedAt(Date.now());
    } catch (err) {
      if (id !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Light-weight stats-only refresh used by the 2s poller; does not touch
  // channels/config to avoid clobbering local optimistic UI state.
  const refreshStats = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    try {
      const statsResp = await imageQueueApi.getStats();
      setEnabled(statsResp.enabled);
      const next: Record<string, ImageChannelStat> = {};
      statsResp.channels.forEach((s) => {
        next[s.channel_id] = s;
      });
      setStats(next);
      setStatsUpdatedAt(Date.now());
    } catch {
      // Swallow polling errors silently — the main refresh will surface them.
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  useInterval(active ? refreshStats : () => {}, active ? STATS_POLL_MS : null);

  // Fire an immediate refresh when the user returns to the tab; the
  // interval will otherwise wait up to STATS_POLL_MS before the first
  // post-visibility tick, which feels laggy.
  useEffect(() => {
    if (!active) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void refreshStats();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active, refreshStats]);

  const createChannel = useCallback(
    async (channel: ImageChannel) => {
      setSaving(true);
      try {
        const next = [...channels, channel];
        await imageQueueApi.replaceChannels(next);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [channels, refresh]
  );

  const updateChannel = useCallback(
    async (id: string, value: Partial<ImageChannel>) => {
      setSaving(true);
      try {
        await imageQueueApi.patchChannel({ id }, value);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const deleteChannel = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        await imageQueueApi.deleteChannel({ id });
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const saveQueueConfig = useCallback(
    async (cfg: ImageQueueConfig) => {
      setSaving(true);
      try {
        await imageQueueApi.putQueueConfig(cfg);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  return {
    channels,
    queueConfig,
    groups,
    stats,
    statsUpdatedAt,
    enabled,
    loading,
    saving,
    error,
    refresh,
    createChannel,
    updateChannel,
    deleteChannel,
    saveQueueConfig,
  };
}
