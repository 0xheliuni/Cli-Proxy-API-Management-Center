/**
 * Add / edit drawer for a single image channel.
 *
 * Reuses Sheet primitive; on submit calls the appropriate create / update
 * handler from useImageQueueData.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { ImageChannel, ImageChannelType, ImageQueueGroupSummary } from '@/types';

interface ImageChannelSheetProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial: ImageChannel | null;
  saving: boolean;
  groups: ImageQueueGroupSummary[];
  defaultGroup?: string;
  onClose: () => void;
  onSubmit: (value: ImageChannel) => Promise<void>;
}

const EMPTY_CHANNEL: ImageChannel = {
  id: '',
  group: '',
  type: 'gemini_native',
  'base-url': '',
  'api-key': '',
  models: [],
  'max-rpm': 60,
  'proxy-url': '',
  headers: {},
};

const TYPE_OPTIONS = [
  { value: 'gemini_native', label: 'gemini_native' },
  { value: 'openai_compatible', label: 'openai_compatible' },
];

type ChannelDraft = ImageChannel & {
  modelsText: string;
  headersText: string;
};

const toDraft = (src: ImageChannel | null, defaultGroup?: string): ChannelDraft => {
  const base = src ?? { ...EMPTY_CHANNEL, group: defaultGroup ?? '' };
  return {
    ...base,
    modelsText: (base.models ?? []).join(', '),
    headersText: Object.entries(base.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
  };
};

const parseModels = (text: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .forEach((m) => {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    });
  return out;
};

const parseHeaders = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const sep = trimmed.indexOf(':');
    if (sep <= 0) return;
    const k = trimmed.slice(0, sep).trim();
    const v = trimmed.slice(sep + 1).trim();
    if (k) out[k] = v;
  });
  return out;
};

export function ImageChannelSheet({
  open,
  mode,
  initial,
  saving,
  groups,
  defaultGroup,
  onClose,
  onSubmit,
}: ImageChannelSheetProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ChannelDraft>(() => toDraft(initial, defaultGroup));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(toDraft(initial, defaultGroup));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, defaultGroup]);

  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.name, label: g.name })),
    [groups]
  );

  const validate = (d: ChannelDraft): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!d.id.trim()) e.id = t('imageQueue.errors.idRequired') ?? 'ID is required';
    if (!d.group.trim()) e.group = t('imageQueue.errors.groupRequired') ?? 'Group is required';
    if (!d['base-url'].trim())
      e['base-url'] = t('imageQueue.errors.baseUrlRequired') ?? 'Base URL is required';
    if (!d['api-key'].trim())
      e['api-key'] = t('imageQueue.errors.apiKeyRequired') ?? 'API key is required';
    const models = parseModels(d.modelsText);
    if (models.length === 0)
      e.models = t('imageQueue.errors.modelsRequired') ?? 'At least one model is required';
    if (d['max-rpm'] < 0)
      e['max-rpm'] = t('imageQueue.errors.maxRpmInvalid') ?? 'Must be >= 0';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const payload: ImageChannel = {
      id: draft.id.trim(),
      group: draft.group.trim(),
      type: draft.type,
      'base-url': draft['base-url'].trim(),
      'api-key': draft['api-key'].trim(),
      models: parseModels(draft.modelsText),
      'max-rpm': draft['max-rpm'] | 0,
      'proxy-url': draft['proxy-url']?.trim() || undefined,
      headers: parseHeaders(draft.headersText),
    };
    if (payload.headers && Object.keys(payload.headers).length === 0) {
      delete payload.headers;
    }
    await onSubmit(payload);
  };

  const footer = useMemo(
    () => (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={saving || groupOptions.length === 0}
        >
          {saving ? t('imageQueue.actions.saving') : t('common.save')}
        </Button>
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saving, draft, groupOptions.length]
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      title={
        mode === 'create'
          ? t('imageQueue.sheet.titleCreate') ?? 'Add Image Channel'
          : t('imageQueue.sheet.titleEdit') ?? 'Edit Image Channel'
      }
      footer={footer}
      closeDisabled={saving}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
        <Input
          label={t('imageQueue.fields.id') ?? 'Channel ID'}
          value={draft.id}
          onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          error={errors.id}
          disabled={mode === 'edit'}
        />
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
            {t('imageQueue.fields.group') ?? 'Group (pool)'}
          </label>
          <Select
            value={draft.group}
            options={groupOptions}
            onChange={(v) => setDraft({ ...draft, group: v })}
            placeholder={t('imageQueue.fields.groupPlaceholder') ?? 'Select a pool'}
            disabled={groupOptions.length === 0}
          />
          {groupOptions.length === 0 && (
            <div style={{ color: '#d32f2f', fontSize: 12, marginTop: 4 }}>
              {t('imageQueue.errors.noPoolDefined') ?? 'Define a pool in Queue Config first.'}
            </div>
          )}
          {errors.group && groupOptions.length > 0 && (
            <div style={{ color: '#d32f2f', fontSize: 12, marginTop: 4 }}>{errors.group}</div>
          )}
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
            {t('imageQueue.fields.type') ?? 'Type'}
          </label>
          <Select
            value={draft.type}
            options={TYPE_OPTIONS}
            onChange={(v) => setDraft({ ...draft, type: v as ImageChannelType })}
          />
        </div>
        <Input
          label={t('imageQueue.fields.baseUrl') ?? 'Base URL'}
          value={draft['base-url']}
          onChange={(e) => setDraft({ ...draft, 'base-url': e.target.value })}
          error={errors['base-url']}
          placeholder="https://generativelanguage.googleapis.com"
        />
        <Input
          label={t('imageQueue.fields.apiKey') ?? 'API Key'}
          type="password"
          value={draft['api-key']}
          onChange={(e) => setDraft({ ...draft, 'api-key': e.target.value })}
          error={errors['api-key']}
        />
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
            {t('imageQueue.fields.models') ?? 'Models (comma or whitespace separated)'}
          </label>
          <textarea
            value={draft.modelsText}
            onChange={(e) => setDraft({ ...draft, modelsText: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: 8,
              fontFamily: 'inherit',
              fontSize: 13,
              border: '1px solid var(--border-color, #d0d0d0)',
              borderRadius: 6,
              resize: 'vertical',
            }}
            placeholder="gemini-3-pro-image-preview, imagen-3.0-generate-001"
          />
          {errors.models && (
            <div style={{ color: '#d32f2f', fontSize: 12, marginTop: 4 }}>{errors.models}</div>
          )}
        </div>
        <Input
          label={t('imageQueue.fields.maxRpm') ?? 'Max RPM (0 = unlimited)'}
          type="number"
          value={draft['max-rpm']}
          onChange={(e) => setDraft({ ...draft, 'max-rpm': Number(e.target.value) })}
          error={errors['max-rpm']}
        />
        <Input
          label={t('imageQueue.fields.proxyUrl') ?? 'Proxy URL (optional)'}
          value={draft['proxy-url'] ?? ''}
          onChange={(e) => setDraft({ ...draft, 'proxy-url': e.target.value })}
          placeholder="socks5://user:pass@host:port"
        />
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
            {t('imageQueue.fields.headers') ?? 'Headers (one Key: Value per line)'}
          </label>
          <textarea
            value={draft.headersText}
            onChange={(e) => setDraft({ ...draft, headersText: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: 8,
              fontFamily: 'inherit',
              fontSize: 13,
              border: '1px solid var(--border-color, #d0d0d0)',
              borderRadius: 6,
              resize: 'vertical',
            }}
            placeholder="HTTP-Referer: https://example.com"
          />
        </div>
      </div>
    </Sheet>
  );
}
