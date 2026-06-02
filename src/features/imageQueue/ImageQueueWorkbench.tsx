/**
 * Image Queue workbench — self-contained tab content.
 *
 * Lists channels with live per-channel RPM usage, exposes channel CRUD via a
 * Sheet form, and exposes the queue runtime config via a Modal. Polls
 * /image-queue/stats every 5 seconds while mounted.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores';
import type { ImageChannel } from '@/types';
import { useImageQueueData } from './useImageQueueData';
import { ImageChannelSheet } from './ImageChannelSheet';
import { ImageQueueConfigModal } from './ImageQueueConfigModal';

interface SheetState {
  open: boolean;
  mode: 'create' | 'edit';
  initial: ImageChannel | null;
}

const usageRatio = (current: number, max: number): number => {
  if (max <= 0) return 0;
  return Math.min(1, current / max);
};

export function ImageQueueWorkbench({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const data = useImageQueueData(active);

  const [sheet, setSheet] = useState<SheetState>({ open: false, mode: 'create', initial: null });
  const [configOpen, setConfigOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>('');

  // Default the active group to the first known pool. If groups appear later
  // (e.g. after the user defines them in Queue Config) auto-select one.
  useEffect(() => {
    if (!activeGroup && data.groups.length > 0) {
      setActiveGroup(data.groups[0].name);
    }
    if (activeGroup && !data.groups.find((g) => g.name === activeGroup) && data.groups.length > 0) {
      setActiveGroup(data.groups[0].name);
    }
  }, [activeGroup, data.groups]);

  const visibleChannels = useMemo(
    () => (activeGroup ? data.channels.filter((c) => c.group === activeGroup) : data.channels),
    [activeGroup, data.channels]
  );

  const onCreate = () => setSheet({ open: true, mode: 'create', initial: null });
  const onEdit = (ch: ImageChannel) =>
    setSheet({ open: true, mode: 'edit', initial: ch });
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  const handleSubmit = async (value: ImageChannel) => {
    try {
      if (sheet.mode === 'create') {
        await data.createChannel(value);
        showNotification(t('imageQueue.toast.created') ?? 'Channel created', 'success');
      } else {
        await data.updateChannel(value.id, value);
        showNotification(t('imageQueue.toast.updated') ?? 'Channel updated', 'success');
      }
      closeSheet();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(
        `${t('imageQueue.toast.saveFailed') ?? 'Save failed'}: ${msg}`,
        'error'
      );
    }
  };

  const handleDelete = (ch: ImageChannel) => {
    showConfirmation({
      title: t('imageQueue.confirm.deleteTitle') ?? 'Delete image channel',
      message:
        t('imageQueue.confirm.deleteMessage', { id: ch.id }) ??
        `Delete channel "${ch.id}"? This cannot be undone.`,
      confirmText: t('common.delete') ?? 'Delete',
      onConfirm: async () => {
        try {
          await data.deleteChannel(ch.id);
          showNotification(t('imageQueue.toast.deleted') ?? 'Channel deleted', 'success');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          showNotification(
            `${t('imageQueue.toast.deleteFailed') ?? 'Delete failed'}: ${msg}`,
            'error'
          );
        }
      },
    });
  };

  const handleSaveConfig = async (cfg: typeof data.queueConfig extends infer T ? T : never) => {
    if (!cfg) return;
    try {
      await data.saveQueueConfig(cfg);
      showNotification(t('imageQueue.toast.configSaved') ?? 'Queue config saved', 'success');
      setConfigOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(
        `${t('imageQueue.toast.configSaveFailed') ?? 'Save failed'}: ${msg}`,
        'error'
      );
    }
  };

  // Tick once per second so "Updated Xs ago" stays current without making
  // the poller itself any faster.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const liveIndicator = useMemo(() => {
    const updatedAt = data.statsUpdatedAt;
    const ageMs = updatedAt > 0 ? nowTick - updatedAt : -1;
    const ageSec = ageMs >= 0 ? Math.max(0, Math.floor(ageMs / 1000)) : -1;
    const stale = ageMs >= 0 && ageMs > 10_000; // 10s without a fresh stat
    const dotColor = ageSec < 0 ? '#999' : stale ? '#ef6c00' : '#2e7d32';
    const text =
      ageSec < 0
        ? t('imageQueue.live.waiting') ?? 'Waiting for stats…'
        : ageSec === 0
        ? t('imageQueue.live.now') ?? 'Live · just now'
        : (t('imageQueue.live.ago', { sec: ageSec }) ??
            `Live · updated ${ageSec}s ago`);
    return (
      <span
        title={text}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 12,
          fontSize: 12,
          color: dotColor,
          border: `1px solid ${dotColor}33`,
          background: `${dotColor}11`,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: dotColor,
            animation: stale || ageSec < 0 ? 'none' : 'iq-pulse 1.4s ease-in-out infinite',
          }}
        />
        {text}
      </span>
    );
  }, [data.statsUpdatedAt, nowTick, t]);

  const queueStatusBadge = useMemo(() => {
    const enabled = data.enabled;
    const text =
      enabled === null
        ? t('imageQueue.status.unknown') ?? 'Status unknown'
        : enabled
        ? t('imageQueue.status.running') ?? 'Running'
        : t('imageQueue.status.stopped') ?? 'Stopped';
    const color = enabled === null ? '#999' : enabled ? '#2e7d32' : '#c62828';
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          color,
          border: `1px solid ${color}`,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
        {text}
      </span>
    );
  }, [data.enabled, t]);

  return (
    <div style={{ padding: '8px 4px 24px' }}>
      <style>{`
        @keyframes iq-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.78); }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {t('imageQueue.title') ?? 'Image Queue'}
          </h2>
          {queueStatusBadge}
          {liveIndicator}
          <span style={{ fontSize: 13, color: '#666' }}>
            {t('imageQueue.summary', { count: data.channels.length }) ??
              `${data.channels.length} channel(s)`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => void data.refresh()} disabled={data.loading}>
            {data.loading ? <LoadingSpinner size={16} /> : t('common.refresh') ?? 'Refresh'}
          </Button>
          <Button variant="secondary" onClick={() => setConfigOpen(true)}>
            {t('imageQueue.actions.queueConfig') ?? 'Queue Config'}
          </Button>
          <Button variant="primary" onClick={onCreate} disabled={data.saving}>
            {t('imageQueue.actions.newChannel') ?? '+ Channel'}
          </Button>
        </div>
      </div>

      {data.error && (
        <div
          style={{
            background: '#fff3e0',
            border: '1px solid #ffcc80',
            color: '#7c4a00',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {data.error}
        </div>
      )}

      {data.groups.length > 0 ? (
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 12,
            borderBottom: '1px solid var(--border-color, #e0e0e0)',
          }}
          role="tablist"
        >
          {data.groups.map((g) => {
            const isActive = g.name === activeGroup;
            return (
              <button
                key={g.name}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveGroup(g.name)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary, #111)' : 'var(--text-secondary, #555)',
                  borderBottom: isActive ? '2px solid var(--accent, #1976d2)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {g.name}{' '}
                <span style={{ color: '#999', fontSize: 12 }}>({g.channel_count})</span>
              </button>
            );
          })}
        </div>
      ) : (
        !data.loading && (
          <div
            onClick={() => setConfigOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setConfigOpen(true);
            }}
            style={{
              cursor: 'pointer',
              padding: '10px 14px',
              marginBottom: 12,
              background: '#fff7e0',
              border: '1px solid #ffd97a',
              borderRadius: 6,
              fontSize: 13,
              color: '#7c4a00',
            }}
          >
            {t('imageQueue.empty.noGroups') ??
              'No pools configured yet. Open Queue Config to create one.'}
          </div>
        )
      )}

      {visibleChannels.length === 0 && !data.loading ? (
        <EmptyState
          title={t('imageQueue.empty.title') ?? 'No image channels configured'}
          description={
            t('imageQueue.empty.description') ??
            'Add a channel to dispatch image-generation requests.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('imageQueue.columns.id') ?? 'ID'}</TableHead>
              <TableHead>{t('imageQueue.columns.type') ?? 'Type'}</TableHead>
              <TableHead>{t('imageQueue.columns.baseUrl') ?? 'Base URL'}</TableHead>
              <TableHead>{t('imageQueue.columns.models') ?? 'Models'}</TableHead>
              <TableHead>{t('imageQueue.columns.rpm') ?? 'RPM (now / cap)'}</TableHead>
              <TableHead>{t('imageQueue.columns.health') ?? 'Health'}</TableHead>
              <TableHead style={{ textAlign: 'right' }}>
                {t('imageQueue.columns.actions') ?? 'Actions'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleChannels.map((ch) => {
              const stat = data.stats[ch.id];
              const current = stat?.current_rpm ?? 0;
              const cooling = stat?.cooling ?? false;
              const fails = stat?.consecutive_fails ?? 0;
              const ratio = usageRatio(current, ch['max-rpm']);
              const barColor = ratio >= 1 ? '#c62828' : ratio >= 0.8 ? '#ef6c00' : '#2e7d32';
              return (
                <TableRow key={ch.id} style={{ opacity: cooling ? 0.7 : 1 }}>
                  <TableCell>
                    <code style={{ fontSize: 13 }}>{ch.id}</code>
                  </TableCell>
                  <TableCell>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: ch.type === 'gemini_native' ? '#e3f2fd' : '#fce4ec',
                        color: ch.type === 'gemini_native' ? '#1565c0' : '#ad1457',
                      }}
                    >
                      {ch.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      title={ch['base-url']}
                      style={{
                        display: 'inline-block',
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                        fontSize: 13,
                      }}
                    >
                      {ch['base-url']}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      title={ch.models.join(', ')}
                      style={{
                        display: 'inline-block',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                        fontSize: 12,
                        color: '#555',
                      }}
                    >
                      {ch.models.join(', ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}
                    >
                      <span style={{ fontSize: 12, color: '#444' }}>
                        <span
                          key={current}
                          style={{
                            fontWeight: 600,
                            color: barColor,
                            display: 'inline-block',
                            animation: 'iq-pulse 0.6s ease-out',
                          }}
                        >
                          {current}
                        </span>
                        {' / '}
                        {ch['max-rpm'] > 0 ? ch['max-rpm'] : '∞'}
                      </span>
                      <div
                        style={{
                          height: 4,
                          background: '#e0e0e0',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${ratio * 100}%`,
                            height: '100%',
                            background: barColor,
                            transition: 'width 0.3s ease, background-color 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {cooling ? (
                      <span
                        title={
                          t('imageQueue.health.coolingTip', { fails }) ??
                          `Cooling down · consecutive fails=${fails}`
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#c62828',
                          background: '#ffebee',
                          border: '1px solid #ffcdd2',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            background: '#c62828',
                          }}
                        />
                        {t('imageQueue.health.cooling') ?? 'Cooling'}
                        {fails > 1 && (
                          <span style={{ color: '#999', fontWeight: 400 }}>
                            ×{fails}
                          </span>
                        )}
                      </span>
                    ) : fails > 0 ? (
                      <span
                        title={
                          t('imageQueue.health.recoveringTip', { fails }) ??
                          `Recently failed ${fails}x`
                        }
                        style={{ fontSize: 12, color: '#ef6c00' }}
                      >
                        ⚠ {fails}
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          color: '#2e7d32',
                        }}
                      >
                        ●
                      </span>
                    )}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(ch)}
                      disabled={data.saving}
                    >
                      {t('common.edit') ?? 'Edit'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(ch)}
                      disabled={data.saving}
                    >
                      {t('common.delete') ?? 'Delete'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ImageChannelSheet
        open={sheet.open}
        mode={sheet.mode}
        initial={sheet.initial}
        saving={data.saving}
        groups={data.groups}
        defaultGroup={activeGroup}
        onClose={closeSheet}
        onSubmit={handleSubmit}
      />
      <ImageQueueConfigModal
        open={configOpen}
        initial={data.queueConfig}
        saving={data.saving}
        onClose={() => setConfigOpen(false)}
        onSubmit={handleSaveConfig}
      />
    </div>
  );
}
