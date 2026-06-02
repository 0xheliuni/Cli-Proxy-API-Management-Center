/**
 * Modal editor for the ImageQueue runtime config block.
 *
 * Layout: a single scrollable form.
 *  - Top: Runtime section (enable toggle + Redis settings + global wall-clock).
 *  - Below: Groups section — a stacked list of editable cards (one per group)
 *    rather than tabs. Each card carries its own name / worker-concurrency /
 *    image-models, plus a Delete action. A "+ Add Group" button at the bottom
 *    appends a new empty card.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { ImageQueueConfig, ImageQueueGroup } from '@/types';

interface ImageQueueConfigModalProps {
  open: boolean;
  initial: ImageQueueConfig | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (cfg: ImageQueueConfig) => Promise<void>;
}

const EMPTY_CFG: ImageQueueConfig = {
  enable: false,
  'redis-addr': '127.0.0.1:6379',
  'redis-db': 0,
  'redis-password': '',
  'key-prefix': 'cliproxy:image',
  'max-wait-seconds': 55,
  groups: [],
};

type GroupDraft = ImageQueueGroup & { modelsText: string };

type Draft = Omit<ImageQueueConfig, 'groups'> & {
  groups: GroupDraft[];
};

const toGroupDraft = (g: ImageQueueGroup): GroupDraft => ({
  ...g,
  modelsText: (g['image-models'] ?? []).join('\n'),
});

const toDraft = (cfg: ImageQueueConfig | null): Draft => {
  const base = cfg ?? EMPTY_CFG;
  return {
    ...base,
    groups: (base.groups ?? []).map(toGroupDraft),
  };
};

const parseModels = (text: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((m) => {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    });
  return out;
};

export function ImageQueueConfigModal({
  open,
  initial,
  saving,
  onClose,
  onSubmit,
}: ImageQueueConfigModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));

  useEffect(() => {
    if (open) {
      setDraft(toDraft(initial));
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    const payload: ImageQueueConfig = {
      enable: draft.enable,
      'redis-addr': draft['redis-addr'].trim(),
      'redis-db': draft['redis-db'] | 0,
      'redis-password': draft['redis-password'] ?? '',
      'key-prefix': (draft['key-prefix'] ?? '').trim(),
      'max-wait-seconds': draft['max-wait-seconds'] | 0,
      groups: draft.groups
        .filter((g) => g.name.trim() !== '')
        .map((g) => ({
          name: g.name.trim(),
          'worker-concurrency': g['worker-concurrency'] | 0,
          'image-models': parseModels(g.modelsText),
        })),
    };
    await onSubmit(payload);
  };

  const setGroup = (idx: number, patch: Partial<GroupDraft>) => {
    setDraft((d) => {
      const next = [...d.groups];
      next[idx] = { ...next[idx], ...patch };
      return { ...d, groups: next };
    });
  };

  const addGroup = () => {
    setDraft((d) => ({
      ...d,
      groups: [
        ...d.groups,
        { name: '', 'worker-concurrency': 0, 'image-models': [], modelsText: '' },
      ],
    }));
  };

  const removeGroup = (idx: number) => {
    setDraft((d) => ({
      ...d,
      groups: d.groups.filter((_, i) => i !== idx),
    }));
  };

  const footer = useMemo(
    () => (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? t('imageQueue.actions.saving') : t('common.save')}
        </Button>
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saving, draft]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('imageQueue.queueConfig.title') ?? 'Image Queue Runtime Config'}
      footer={footer}
      width={640}
      closeDisabled={saving}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          maxHeight: 'min(72vh, 720px)',
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {/* ── Runtime section ─────────────────────────────────────────── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {t('imageQueue.queueConfig.sectionRuntime') ?? 'Runtime'}
            </strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ToggleSwitch
                checked={draft.enable}
                onChange={(v) => setDraft({ ...draft, enable: v })}
              />
              <span style={{ fontSize: 13 }}>
                {t('imageQueue.queueConfig.enable') ?? 'Enable image queue'}
              </span>
            </div>
          </div>
          <Input
            label={t('imageQueue.queueConfig.redisAddr') ?? 'Redis address'}
            value={draft['redis-addr']}
            onChange={(e) => setDraft({ ...draft, 'redis-addr': e.target.value })}
            placeholder="127.0.0.1:6379"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label={t('imageQueue.queueConfig.redisDb') ?? 'Redis DB'}
              type="number"
              value={draft['redis-db']}
              onChange={(e) => setDraft({ ...draft, 'redis-db': Number(e.target.value) })}
            />
            <Input
              label={t('imageQueue.queueConfig.redisPassword') ?? 'Redis password'}
              type="password"
              value={draft['redis-password'] ?? ''}
              onChange={(e) => setDraft({ ...draft, 'redis-password': e.target.value })}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label={t('imageQueue.queueConfig.keyPrefix') ?? 'Redis key prefix'}
              value={draft['key-prefix'] ?? ''}
              onChange={(e) => setDraft({ ...draft, 'key-prefix': e.target.value })}
              placeholder="cliproxy:image"
            />
            <Input
              label={t('imageQueue.queueConfig.maxWaitSeconds') ?? 'Max wait seconds'}
              type="number"
              value={draft['max-wait-seconds']}
              onChange={(e) => setDraft({ ...draft, 'max-wait-seconds': Number(e.target.value) })}
            />
          </div>
        </section>

        {/* ── Groups section ──────────────────────────────────────────── */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingTop: 14,
            borderTop: '1px solid var(--border-color, #e0e0e0)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {t('imageQueue.queueConfig.groups') ?? 'Groups'}
              <span style={{ color: '#999', fontWeight: 400, marginLeft: 8 }}>
                ({draft.groups.length})
              </span>
            </strong>
            <Button variant="secondary" size="sm" onClick={addGroup}>
              {t('imageQueue.queueConfig.addGroup') ?? '+ Add Group'}
            </Button>
          </div>

          {draft.groups.length === 0 ? (
            <div
              style={{
                color: '#666',
                fontSize: 13,
                padding: '12px 14px',
                background: '#fafafa',
                border: '1px dashed #d0d0d0',
                borderRadius: 6,
              }}
            >
              {t('imageQueue.queueConfig.noGroups') ?? 'No groups configured yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {draft.groups.map((g, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--border-color, #e0e0e0)',
                    borderRadius: 8,
                    padding: 14,
                    background: 'var(--surface-1, #fff)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 200px auto',
                      gap: 10,
                      alignItems: 'end',
                    }}
                  >
                    <Input
                      label={t('imageQueue.queueConfig.groupName') ?? 'Group name'}
                      value={g.name}
                      onChange={(e) => setGroup(idx, { name: e.target.value })}
                      placeholder="gemini"
                    />
                    <Input
                      label={`${
                        t('imageQueue.queueConfig.workerConcurrency') ?? 'Worker concurrency'
                      } (${
                        t('imageQueue.queueConfig.workerConcurrencyHint') ?? '0 = auto'
                      })`}
                      type="number"
                      value={g['worker-concurrency']}
                      onChange={(e) =>
                        setGroup(idx, { 'worker-concurrency': Number(e.target.value) })
                      }
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => removeGroup(idx)}
                    >
                      {t('imageQueue.queueConfig.removeGroup') ?? 'Delete'}
                    </Button>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 6,
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {t('imageQueue.queueConfig.imageModels') ??
                        'Image models (one per line)'}
                    </label>
                    <textarea
                      value={g.modelsText}
                      onChange={(e) => setGroup(idx, { modelsText: e.target.value })}
                      rows={4}
                      style={{
                        width: '100%',
                        padding: 8,
                        fontFamily: 'inherit',
                        fontSize: 13,
                        border: '1px solid var(--border-color, #d0d0d0)',
                        borderRadius: 6,
                        resize: 'vertical',
                      }}
                      placeholder={
                        'gemini-3-pro-image-preview\ngemini-3.1-flash-image-preview'
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
