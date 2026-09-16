'use client';

import { getAttachmentPolicy } from '@/lib/email/providers/attachment-policies';
import { SchedulePreview } from './SchedulePreview';
import { useEligibility, type EligibilityResult } from './useEligibility';
import Link from 'next/link';
import { attachmentSelectionError, MAX_FILE_BYTES } from '@/lib/email/attachment-limits';
import { useEffect, useMemo, useRef, useState } from 'react';
import { localDateTimeInZone, zonedDateTimeToIso, formatScheduledTime } from '@/lib/scheduling/time';
import { Button } from '@/components/ui/Button';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SortSelect } from '@/components/ui/SortSelect';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';

const steps = ['Campaign', 'Content', 'Contacts', 'Schedule', 'Review'];

const MAX_CAMPAIGN_CONTACTS = 1000;
const CONTACT_PAGE_SIZE = 20;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));
}

export interface CampaignSelectOption {
  id: string;
  label: string;
  description?: string;
  size_bytes?: number | null;
  provider?: string;
}

export interface ResendRecipient {
  contactId: string;
  recipientEmail: string;
}

export interface CampaignSubmitData {
  name: string;
  emailAccountId: string;
  attachmentIds: string[];
  templateId: string;
  contactIds: string[];
  startAt: string;
  timezone: string;
  intervalMinutes: number;
  dailyLimit: number | null;
  missingValueAction: 'exclude' | 'continue';
  unknownTokenAction: 'fix' | 'continue';
  idempotencyKey: string;
  previewFingerprint: string;
  resendRecipients: ResendRecipient[];
}

export interface CampaignCreateResult {
  success: boolean;
  replayed?: boolean;
  recipientSummary?: unknown;
  error?: { type: string; message: string; details?: { preCheck?: EligibilityResult } };
}

interface CampaignWizardProps {
  emailAccounts?: CampaignSelectOption[];
  attachments?: CampaignSelectOption[];
  templates?: CampaignSelectOption[];
  contacts?: CampaignSelectOption[];
  loading?: boolean;
  onSubmit: (data: CampaignSubmitData) => void | Promise<CampaignCreateResult | void>;
}

function defaultLocalDateTime(): string {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  date.setSeconds(0, 0);
  return localDateTimeInZone(date, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}

function optionList(label: string, options: CampaignSelectOption[]) {
  if (options.length === 0) return [{ value: '', label }];
  return options.map((option) => ({ value: option.id, label: option.label }));
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'DUPLICATE_ADDRESS': return 'Same address selected twice';
    case 'PREVIOUSLY_SENT': return 'Previously emailed using this template';
    case 'PENDING': return 'Already scheduled';
    case 'DELIVERY_UNKNOWN': return 'Delivery needs review';
    case 'MISSING_VALUES': return 'Missing personalization values';
    default: return reason;
  }
}

function reasonBadgeVariant(reason: string | null): 'warning' | 'error' | 'information' | 'default' {
  switch (reason) {
    case 'DELIVERY_UNKNOWN': return 'error';
    case 'PENDING': return 'warning';
    case 'PREVIOUSLY_SENT': return 'information';
    case 'DUPLICATE_ADDRESS': return 'default';
    case 'MISSING_VALUES': return 'warning';
    default: return 'default';
  }
}

function reasonTooltip(reason: string | null): string | undefined {
  switch (reason) {
    case 'PENDING':
      return 'Email is queued in another campaign with this template and account. It will be excluded. Once sent, you can follow up. To send now: cancel the existing campaign or use a different template/sending account.';
    case 'PREVIOUSLY_SENT':
      return 'Already received this template from this account. Click \'Choose follow-ups\' to send again.';
    case 'DELIVERY_UNKNOWN':
      return 'A previous send has unknown status. An admin must resolve it before this contact can receive emails.';
    case 'DUPLICATE_ADDRESS':
      return 'Another contact with the same email address was already chosen. This contact will be excluded.';
    case 'MISSING_VALUES':
      return 'This contact is missing values for template merge tags and will be excluded.';
    default:
      return undefined;
  }
}

export function CampaignWizard({
  emailAccounts = [],
  attachments = [],
  templates = [],
  contacts = [],
  loading = false,
  onSubmit,
}: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emailAccountId, setEmailAccountId] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [selectedTemplateLabel, setSelectedTemplateLabel] = useState('');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const [contactSortOrder, setContactSortOrder] = useState<'desc' | 'asc'>('desc');
  const [contactStartDate, setContactStartDate] = useState('');
  const [contactEndDate, setContactEndDate] = useState('');
  const [fetchedContacts, setFetchedContacts] = useState<CampaignSelectOption[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [contactTotalPages, setContactTotalPages] = useState(1);
  const [contactsLoading, setContactsLoading] = useState(false);
  const contactAbortRef = useRef<AbortController | null>(null);
  const contactSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startAt, setStartAt] = useState(defaultLocalDateTime);
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [intervalMinutes, setIntervalMinutes] = useState('5');
  const [dailyLimit, setDailyLimit] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDetails, setShowDetails] = useState(false);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [resendRecipients, setResendRecipients] = useState<ResendRecipient[]>([]);
  const [missingValueAction, setMissingValueAction] = useState<'exclude' | 'continue'>('exclude');
  const [unknownTokenAction, setUnknownTokenAction] = useState<'fix' | 'continue'>('fix');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recipientStatuses, setRecipientStatuses] = useState<Map<string, { classification: string; lastSentAt?: string }>>(new Map());
  const [recipientStatusLoading, setRecipientStatusLoading] = useState(false);
  const [recipientStatusDone, setRecipientStatusDone] = useState(false);
  const [followUpNotice, setFollowUpNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const recipientStatusAbort = useRef<AbortController | null>(null);
  const recipientStatusDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userDailyLimit, setUserDailyLimit] = useState<number | null>(null);

  const effectiveEmailAccountId = emailAccountId || emailAccounts[0]?.id || '';
  const selectedAttachments = attachments.filter(item => attachmentIds.includes(item.id));
  const provider = emailAccounts.find(account => account.id === effectiveEmailAccountId)?.provider ?? '';
  const attachmentPolicy = getAttachmentPolicy(provider);
  const attachmentError = effectiveEmailAccountId ? attachmentSelectionError(selectedAttachments, provider) : null;
  const attachmentBytes = selectedAttachments.reduce((sum, item) => sum + (item.size_bytes ?? MAX_FILE_BYTES), 0);
  const usePaginatedTemplates = templates.length === 0;
  const effectiveTemplateId = templateId || (!usePaginatedTemplates ? templates[0]?.id : '') || '';

  const selected = useMemo(
    () => ({
      emailAccount: emailAccounts.find((item) => item.id === effectiveEmailAccountId),
      template: templates.find((item) => item.id === effectiveTemplateId)
        ?? (selectedTemplateLabel ? { id: effectiveTemplateId, label: selectedTemplateLabel } : undefined),
    }),
    [effectiveEmailAccountId, effectiveTemplateId, emailAccounts, templates, selectedTemplateLabel]
  );

  const eligibility = useEligibility({
    templateId: effectiveTemplateId,
    emailAccountId: effectiveEmailAccountId,
    contactIds,
    attachmentIds,
    resendRecipients,
    missingValueAction,
    unknownTokenAction,
    enabled: step >= 2 && !submitting,
  });

  const validateStep = (targetStep = step) => {
    const nextErrors: Record<string, string> = {};
    if (targetStep === 0 && !name.trim()) {
      nextErrors.name = 'Campaign name is required.';
    }
    if (targetStep === 1) {
      if (!effectiveEmailAccountId) nextErrors.emailAccountId = 'Choose a sending account.';
      if (attachmentError) nextErrors.attachmentIds = attachmentError;
      if (!effectiveTemplateId) nextErrors.templateId = 'Choose a template.';
    }
    if (targetStep === 2 && contactIds.length === 0) {
      nextErrors.contactIds = 'Choose at least one contact.';
    }
    if (targetStep === 3) {
      const parsedInterval = Number(intervalMinutes);
      const parsedLimit = dailyLimit.trim() ? Number(dailyLimit) : null;
      try {
        zonedDateTimeToIso(startAt, timezone.trim());
      } catch (error) {
        nextErrors.startAt = error instanceof Error ? error.message : 'Choose a valid start time.';
      }
      if (!timezone.trim()) {
        nextErrors.timezone = 'Timezone is required.';
      }
      if (effectiveCount > 1 && (!Number.isInteger(parsedInterval) || parsedInterval <= 0)) {
        nextErrors.intervalMinutes = 'Enter at least 1 minute, using a whole number.';
      }
      if (effectiveCount > 1 && parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        nextErrors.dailyLimit = 'Enter at least 1 email, or leave this blank for no campaign cap.';
      }
      if (effectiveCount > 1 && parsedLimit !== null && Number.isInteger(parsedLimit) && parsedLimit > effectiveCount) {
        nextErrors.dailyLimit = `Daily limit cannot exceed ${effectiveCount} (your total emails).`;
      }
      if (effectiveCount > 1 && parsedLimit !== null && Number.isInteger(parsedLimit) && userDailyLimit !== null && parsedLimit > userDailyLimit) {
        nextErrors.dailyLimit = `Your daily email limit is ${userDailyLimit}. Enter a value up to ${userDailyLimit}.`;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const selectedCount = contactIds.length;
  const effectiveCount = eligibility.isReady ? eligibility.effectiveCount : selectedCount;
  const singleRecipient = selectedCount === 1;
  const cappedDailyDefault = userDailyLimit ? Math.min(effectiveCount, userDailyLimit) : effectiveCount;

  useEffect(() => {
    if (singleRecipient || effectiveCount <= 1) return;
    const timer = setTimeout(() => setDailyLimit(String(cappedDailyDefault)), 0);
    return () => clearTimeout(timer);
  }, [cappedDailyDefault, singleRecipient, effectiveCount]);

  useEffect(() => {
    if (step < 3 || userDailyLimit !== null) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/user/email-limit', { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { success?: boolean; data?: { dailyEmailLimit?: number } };
        if (body.success && typeof body.data?.dailyEmailLimit === 'number') {
          setUserDailyLimit(body.data.dailyEmailLimit);
        }
      } catch { /* aborted */ }
    })();
    return () => controller.abort();
  }, [step, userDailyLimit]);

  const canSubmit =
    name.trim() &&
    effectiveEmailAccountId &&
    !attachmentError &&
    effectiveTemplateId &&
    contactIds.length > 0 &&
    startAt &&
    timezone.trim() &&
    (singleRecipient || Number(intervalMinutes) > 0) &&
    eligibility.canSchedule;

  const goNext = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const submit = async () => {
    if (submitting || eligibility.isFetching) return;
    const originalStep = step;
    for (let index = 0; index < steps.length - 1; index += 1) {
      if (!validateStep(index)) {
        setStep(index);
        return;
      }
    }
    setStep(originalStep);

    if (!eligibility.canSchedule) {
      setSubmitError(eligibility.errorMessage ?? 'Please review the recipient summary before scheduling.');
      return;
    }

    // Freeze the payload at click time — generate key, fingerprint, and
    // recipient copies synchronously before any state updates (§4.3).
    const frozenKey = idempotencyKey || generateUuid();
    const frozenFingerprint = eligibility.result?.previewFingerprint ?? '';
    const frozenContactIds = [...contactIds];
    const frozenResendRecipients = resendRecipients.map(r => ({ ...r }));
    const data: CampaignSubmitData = {
      name: name.trim(),
      emailAccountId: effectiveEmailAccountId,
      attachmentIds: [...attachmentIds],
      templateId: effectiveTemplateId,
      contactIds: frozenContactIds,
      startAt: zonedDateTimeToIso(startAt, timezone.trim()),
      timezone: timezone.trim(),
      intervalMinutes: singleRecipient ? 5 : Number(intervalMinutes),
      dailyLimit: singleRecipient ? null : (dailyLimit.trim() ? Number(dailyLimit) : null),
      missingValueAction,
      unknownTokenAction,
      idempotencyKey: frozenKey,
      previewFingerprint: frozenFingerprint,
      resendRecipients: frozenResendRecipients,
    };

    setIdempotencyKey(frozenKey);
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(data);
    } catch {
      setSubmitError('Could not schedule the campaign. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleContact = (id: string) => {
    setContactIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    setResendRecipients((current) => current.filter(r => r.contactId !== id));
  };

  const toggleFollowUp = (recipient: { contactId: string; recipientEmail?: string }) => {
    const email = recipient.recipientEmail ?? contacts.find(c => c.id === recipient.contactId)?.description?.split(' - ')[0]?.split(' ')[0] ?? '';
    setResendRecipients((current) => {
      const exists = current.some(r => r.contactId === recipient.contactId);
      if (exists) return current.filter(r => r.contactId !== recipient.contactId);
      return [...current, { contactId: recipient.contactId, recipientEmail: email }];
    });
  };

  const usePaginatedContacts = contacts.length === 0;
  const displayContacts = usePaginatedContacts ? fetchedContacts : contacts.filter(contact =>
    `${contact.label} ${contact.description ?? ''}`.toLowerCase().includes(contactSearch.toLowerCase())
  );

  useEffect(() => {
    if (!usePaginatedContacts || step !== 2) return;
    if (contactSearchDebounce.current) clearTimeout(contactSearchDebounce.current);
    contactSearchDebounce.current = setTimeout(() => {
      contactAbortRef.current?.abort();
      const controller = new AbortController();
      contactAbortRef.current = controller;
      setContactsLoading(true);
      const params = new URLSearchParams({ page: String(contactPage), limit: String(CONTACT_PAGE_SIZE), sortOrder: contactSortOrder });
      if (contactSearch.trim()) params.set('search', contactSearch.trim());
      if (contactStartDate) params.set('startDate', contactStartDate);
      if (contactEndDate) params.set('endDate', contactEndDate);
      fetch(`/api/contacts?${params.toString()}`, { credentials: 'include', signal: controller.signal })
        .then(async res => {
          if (controller.signal.aborted) return;
          const body = await res.json() as { success: boolean; data?: { id: string; name: string | null; email: string }[]; pagination?: { total: number; totalPages: number } };
          if (!body.success || !body.data) return;
          setFetchedContacts(body.data.map(c => ({ id: c.id, label: c.name ?? c.email, description: c.email })));
          setContactTotal(body.pagination?.total ?? body.data.length);
          setContactTotalPages(body.pagination?.totalPages ?? 1);
        })
        .catch(() => { if (!controller.signal.aborted) return; })
        .finally(() => { if (!controller.signal.aborted) setContactsLoading(false); });
    }, usePaginatedContacts ? 250 : 0);
    return () => { if (contactSearchDebounce.current) clearTimeout(contactSearchDebounce.current); };
  }, [usePaginatedContacts, step, contactPage, contactSearch, contactSortOrder, contactStartDate, contactEndDate]);

  useEffect(() => {
    if (step !== 2 || !effectiveTemplateId || !effectiveEmailAccountId) {
      const timer = setTimeout(() => { setRecipientStatuses(new Map()); setRecipientStatusLoading(false); setRecipientStatusDone(false); }, 0);
      return () => clearTimeout(timer);
    }
    const visibleIds = displayContacts.slice(0, 100).map(c => c.id);
    if (visibleIds.length === 0) {
      const timer = setTimeout(() => { setRecipientStatuses(new Map()); setRecipientStatusLoading(false); setRecipientStatusDone(false); }, 0);
      return () => clearTimeout(timer);
    }
    if (recipientStatusDebounce.current) clearTimeout(recipientStatusDebounce.current);
    recipientStatusDebounce.current = setTimeout(() => {
      recipientStatusAbort.current?.abort();
      const controller = new AbortController();
      recipientStatusAbort.current = controller;
      setRecipientStatusLoading(true);
      setRecipientStatusDone(false);
      fetch('/api/campaigns/recipient-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: effectiveTemplateId, emailAccountId: effectiveEmailAccountId, contactIds: visibleIds }),
        signal: controller.signal,
      })
        .then(async res => {
          if (controller.signal.aborted) return;
          const body = await res.json() as { success: boolean; data?: { statuses: Array<{ contactId: string; classification: string; lastSentAt: string | null }> } };
          if (!body.success || !body.data) return;
          const map = new Map<string, { classification: string; lastSentAt?: string }>();
          for (const s of body.data.statuses) {
            if (s.classification !== 'ELIGIBLE') {
              map.set(s.contactId, { classification: s.classification, lastSentAt: s.lastSentAt ?? undefined });
            }
          }
          setRecipientStatuses(map);
          setRecipientStatusDone(true);
        })
        .catch(() => { if (!controller.signal.aborted) return; })
        .finally(() => { if (!controller.signal.aborted) setRecipientStatusLoading(false); });
    }, 300);
    return () => { if (recipientStatusDebounce.current) clearTimeout(recipientStatusDebounce.current); };
  }, [step, effectiveTemplateId, effectiveEmailAccountId, displayContacts]);

  useEffect(() => {
    if (!followUpNotice) return;
    const timer = setTimeout(() => setFollowUpNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [followUpNotice]);

  useEffect(() => {
    if ((submitError || eligibility.status === 'error') && errorRef.current) {
      errorRef.current.focus();
    }
  }, [submitError, eligibility.status]);

  const excludedReasons = eligibility.result?.excludedByReason;
  const hasExclusions = eligibility.isReady && (eligibility.result?.excludedCount ?? 0) > 0;
  const hasFollowUpCandidates = eligibility.isReady && (eligibility.result?.recipients ?? []).some(r => r.canSelectFollowUp);
  const hasMissingValues = eligibility.isReady && (eligibility.result?.missingValues ?? []).length > 0;
  const hasUnknownTokens = eligibility.isReady && (eligibility.result?.unknownTokens ?? []).length > 0;
  const followUpSelectedCount = resendRecipients.length;
  const isZeroEligible = eligibility.isReady && (eligibility.result?.eligibleCount ?? 0) === 0;
  const previewRecipients = (eligibility.result?.recipients ?? []).filter(r => r.included).map(r => ({ name: r.name, email: r.recipientEmail }));

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Campaign creation steps">
        {steps.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={index === step ? 'step' : undefined}
              className={`text-sm font-medium ${index <= step ? 'text-information' : 'text-text-secondary'}`}
            >
              {String(index + 1).padStart(2, '0')} {label}
            </span>
            {index < steps.length - 1 && <span className="h-px w-6 bg-neutral-200" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <p className="text-sm text-text-secondary">Step {step + 1} of {steps.length} — {['Name your campaign so you can find it later.', 'Choose the sender, message template, and optional files.', 'Choose who will receive this campaign.', 'Set when emails start and how often they are sent.', 'Check your selections before scheduling.'][step]}</p>
      <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        {step === 0 ? (
          <Input
            label="Campaign name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            required
          />
        ) : loading && emailAccounts.length === 0 ? (
          <div role="status" aria-label="Preparing campaign choices" className="space-y-4 animate-pulse"><div className="h-10 rounded bg-surface" /><div className="h-24 rounded bg-surface" /></div>
        ) : step === 1 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label="Sending account"
              value={effectiveEmailAccountId}
              onChange={(event) => {
                setEmailAccountId(event.target.value);
                if (resendRecipients.length > 0) {
                  setResendRecipients([]);
                  setFollowUpNotice('Follow-up choices cleared because the sending account changed.');
                }
              }}
              options={optionList('Select account', emailAccounts)}
              error={errors.emailAccountId}
              required
            />
            {usePaginatedTemplates ? (
              <SearchableSelect
                label="Template"
                value={effectiveTemplateId}
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  if (event.target.label) setSelectedTemplateLabel(event.target.label);
                  if (resendRecipients.length > 0) {
                    setResendRecipients([]);
                    setFollowUpNotice('Follow-up choices cleared because the template changed.');
                  }
                }}
                fetchUrl="/api/templates"
                pageSize={10}
                selectedLabel={selectedTemplateLabel}
                mapItem={(item) => ({ value: item.id, label: item.name ?? item.id })}
                error={errors.templateId}
                required
                placeholder="Select template"
              />
            ) : (
              <Select
                label="Template"
                value={effectiveTemplateId}
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  if (resendRecipients.length > 0) {
                    setResendRecipients([]);
                    setFollowUpNotice('Follow-up choices cleared because the template changed.');
                  }
                }}
                options={optionList('Select template', templates)}
                error={errors.templateId}
                required
              />
            )}
            <fieldset className="md:col-span-3 flex flex-col gap-3 border-t border-neutral-200 pt-5">
              <legend className="font-medium text-text-primary">Attachments (optional)</legend>
              <p id="attachment-help" className="text-sm text-text-secondary">Send without attachments, or choose files for {attachmentPolicy?.name ?? 'your sender'}. Up to {attachmentPolicy?.maxCount ?? 0} files, {(attachmentPolicy?.maxFileBytes ?? 0) / 1024 / 1024} MB each and {(attachmentPolicy?.maxTotalBytes ?? 0) / 1024 / 1024} MB total (app sending limits).</p>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span role="status">{attachmentIds.length} files selected — {formatFileSize(attachmentBytes)} / {(attachmentPolicy?.maxTotalBytes ?? 0) / 1024 / 1024} MB</span>
                {attachmentIds.length > 0 && <Button variant="secondary" size="sm" onClick={() => setAttachmentIds([])}>Clear attachments</Button>}
              </div>
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {attachments.map(file => <label key={file.id} className={`flex items-center gap-3 rounded-[var(--radius-md)] border p-3 ${attachmentIds.includes(file.id) ? 'border-information bg-surface' : 'border-neutral-200'}`}>
                  <input type="checkbox" aria-describedby="attachment-help" checked={attachmentIds.includes(file.id)} onChange={() => setAttachmentIds(ids => ids.includes(file.id) ? ids.filter(id => id !== file.id) : [...ids, file.id])} className="h-4 w-4 accent-information" />
                  <span className="min-w-0 break-words text-sm">{file.label}<span className="block text-caption text-text-secondary">{file.size_bytes == null ? 'Size unavailable; reserves 5 MB' : formatFileSize(file.size_bytes)}</span></span>
                </label>)}
              </div>
              {attachments.length === 0 && <p className="text-sm text-text-secondary">No files uploaded. You can continue without attachments.</p>}
              {attachmentError && <p role="alert" className="text-sm text-error">{attachmentError}</p>}
              <Link href="/attachments" target="_blank" className="text-sm text-information hover:underline">Upload files in Attachments (opens a new tab)</Link>
            </fieldset>
          </div>
        ) : step === 2 ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-text-primary">Contacts</legend>

            {eligibility.isFetching && !eligibility.isReady && (
              <div aria-live="polite" className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
                  <p className="text-sm text-text-secondary">Checking recipients…</p>
                </div>
              </div>
            )}

            {recipientStatusLoading && !eligibility.isFetching && (
              <div aria-live="polite" className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
                  <p className="text-sm text-text-secondary">Checking contact statuses…</p>
                </div>
              </div>
            )}

            {eligibility.isReady && (
              <div aria-live="polite" className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
                {eligibility.isFetching ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
                    <p className="font-medium text-text-secondary">Updating…</p>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-text-primary">
                      {effectiveCount} {effectiveCount === 1 ? 'email' : 'emails'} will be scheduled
                    </p>
                    {hasExclusions && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {eligibility.result!.excludedCount} {eligibility.result!.excludedCount === 1 ? 'contact' : 'contacts'} excluded.
                        <button type="button" onClick={() => setShowDetails(d => !d)} className="ml-1 text-information hover:underline">
                          {showDetails ? 'Hide details' : 'View details'}
                        </button>
                        {hasFollowUpCandidates && !showFollowUps && (
                          <button type="button" onClick={() => setShowFollowUps(true)} className="ml-2 text-information hover:underline">
                            Choose follow-ups
                          </button>
                        )}
                      </p>
                    )}
                    {eligibility.isReady && eligibility.result!.includedPreviousCount > 0 && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {eligibility.result!.includedWithoutPreviousSendCount} new {eligibility.result!.includedPreviousCount === 1 ? 'recipient' : 'recipients'} + {eligibility.result!.includedPreviousCount} {eligibility.result!.includedPreviousCount === 1 ? 'follow-up' : 'follow-ups'}
                      </p>
                    )}
                    {eligibility.status === 'error' && (
                      <p className="mt-1 text-sm text-error">
                        {eligibility.errorMessage}
                        <button type="button" onClick={eligibility.retry} className="ml-2 text-information hover:underline">Try again</button>
                      </p>
                    )}
                    {hasUnknownTokens && (
                      <div className="mt-2 rounded-[var(--radius-sm)] border border-error/20 bg-error-light p-3">
                        <p className="text-sm text-error">Unknown tokens: {eligibility.result!.unknownTokens.join(', ')}</p>
                        <div className="mt-2 flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setUnknownTokenAction('fix')}>Fix template</Button>
                          <Button variant="secondary" size="sm" onClick={() => setUnknownTokenAction('continue')}>Continue anyway</Button>
                        </div>
                      </div>
                    )}
                    {showDetails && eligibility.result && (
                      <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 text-sm">
                        <p className="text-text-secondary">Selected: {eligibility.result.selectedCount} · Eligible: {eligibility.result.eligibleCount} · Excluded: {eligibility.result.excludedCount}</p>
                        {excludedReasons && (excludedReasons.duplicateAddress > 0 || excludedReasons.previouslySent > 0 || excludedReasons.pending > 0 || excludedReasons.deliveryUnknown > 0 || excludedReasons.missingValues > 0) && (
                          <ul className="space-y-1 text-text-secondary">
                            {excludedReasons.duplicateAddress > 0 && <li>Same address selected twice: {excludedReasons.duplicateAddress}</li>}
                            {excludedReasons.previouslySent > 0 && <li>Previously emailed using this template: {excludedReasons.previouslySent}</li>}
                            {excludedReasons.pending > 0 && <li>Already scheduled: {excludedReasons.pending}</li>}
                            {excludedReasons.deliveryUnknown > 0 && <li>Delivery needs review: {excludedReasons.deliveryUnknown}</li>}
                            {excludedReasons.missingValues > 0 && <li>Missing personalization values: {excludedReasons.missingValues}</li>}
                          </ul>
                        )}
                        <p className="text-text-secondary">Checks previous emails using this template and sending account, including earlier versions of the template.</p>
                        {hasMissingValues && (
                          <div className="mt-2">
                            <p className="font-medium text-text-primary">Missing personalization values</p>
                            <ul className="mt-1 space-y-1 text-text-secondary">
                              {eligibility.result.missingValues.map(mv => (
                                <li key={mv.token}>{mv.label} ({`{{${mv.token}}}`}): {mv.contactCount} contact(s)</li>
                              ))}
                            </ul>
                            <div className="mt-2 flex gap-2">
                              <Button variant="secondary" size="sm" onClick={() => setMissingValueAction('exclude')}>Exclude affected contacts</Button>
                              <Button variant="secondary" size="sm" onClick={() => setMissingValueAction('continue')}>Send with missing values</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {isZeroEligible && (
              <div role="alert" className="rounded-[var(--radius-md)] border border-error/30 bg-error-light p-4">
                {eligibility.isFetching ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
                    <p className="font-medium text-text-secondary">Updating…</p>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-error">No emails will be scheduled</p>
                    <p className="mt-1 text-sm text-text-secondary">All selected contacts are excluded:</p>
                    <ul className="mt-1 space-y-1 text-sm text-text-secondary">
                      {excludedReasons && excludedReasons.pending > 0 && (
                        <li>{excludedReasons.pending} Already scheduled (emails in queue — wait for them to complete or cancel the existing campaigns)</li>
                      )}
                      {excludedReasons && excludedReasons.previouslySent > 0 && (
                        <li>{excludedReasons.previouslySent} Previously emailed (use follow-ups to resend)</li>
                      )}
                      {excludedReasons && excludedReasons.deliveryUnknown > 0 && (
                        <li>{excludedReasons.deliveryUnknown} Delivery needs review (admin action required)</li>
                      )}
                      {excludedReasons && excludedReasons.duplicateAddress > 0 && (
                        <li>{excludedReasons.duplicateAddress} Same address selected twice</li>
                      )}
                      {excludedReasons && excludedReasons.missingValues > 0 && (
                        <li>{excludedReasons.missingValues} Missing personalization values</li>
                      )}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {excludedReasons && excludedReasons.previouslySent > 0 && (
                        <Button variant="secondary" size="sm" onClick={() => setShowFollowUps(true)}>Choose follow-ups</Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => setStep(1)}>Use a different template or sending account</Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {followUpNotice && (
              <p role="status" className="rounded-[var(--radius-sm)] border border-information/20 bg-surface p-2 text-sm text-text-secondary">
                {followUpNotice}
              </p>
            )}

            {showFollowUps && eligibility.result && (
              <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-text-primary">Choose follow-ups</h4>
                  <button type="button" onClick={() => setShowFollowUps(false)} className="text-sm text-text-secondary hover:underline">Close</button>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{followUpSelectedCount} selected for follow-up</p>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {eligibility.result.recipients.filter(r => r.canSelectFollowUp || resendRecipients.some(rr => rr.contactId === r.contactId)).map(r => {
                    const contact = contacts.find(c => c.id === r.contactId);
                    const checked = resendRecipients.some(rr => rr.contactId === r.contactId);
                    return (
                      <label key={r.contactId} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFollowUp({ contactId: r.contactId, recipientEmail: r.recipientEmail })}
                          disabled={!r.canSelectFollowUp}
                          className="h-4 w-4 accent-information"
                        />
                        <span>{contact?.label ?? r.contactId}</span>
                        {r.lastSentAt && <span className="text-caption text-text-secondary">Last sent: {new Date(r.lastSentAt).toLocaleDateString()}</span>}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => {
                    const visibleIds = new Set(displayContacts.map(c => c.id));
                    const candidates = eligibility.result?.recipients.filter(r => r.canSelectFollowUp && visibleIds.has(r.contactId)) ?? [];
                    setResendRecipients(prev => {
                      const existing = prev.filter(r => !visibleIds.has(r.contactId));
                      return [...existing, ...candidates.map(r => ({ contactId: r.contactId, recipientEmail: r.recipientEmail ?? '' }))];
                    });
                  }}>Select this page for follow-up</Button>
                  <Button variant="secondary" size="sm" onClick={() => setResendRecipients([])} disabled={!followUpSelectedCount}>Clear follow-ups</Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
              <div className="w-full sm:w-64">
                <Input label="Search contacts" value={contactSearch} onChange={event => { setContactSearch(event.target.value); if (usePaginatedContacts) setContactPage(1); }} />
              </div>
              {usePaginatedContacts && (
                <>
                  <SortSelect value={contactSortOrder} onChange={(v) => { setContactSortOrder(v); setContactPage(1); }} />
                  <DateRangeFilter
                    startDate={contactStartDate}
                    endDate={contactEndDate}
                    onStartChange={(v) => { setContactStartDate(v); setContactPage(1); }}
                    onEndChange={(v) => { setContactEndDate(v); setContactPage(1); }}
                    onClear={() => { setContactStartDate(''); setContactEndDate(''); setContactPage(1); }}
                  />
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>{contactIds.length} selected{usePaginatedContacts ? ` · ${contactTotal} total` : ` of ${contacts.length}`}</span>
              <Button variant="secondary" size="sm" onClick={() => setContactIds(prev => { const pageIds = displayContacts.map(c => c.id); const merged = [...new Set([...prev, ...pageIds])]; return merged.slice(0, MAX_CAMPAIGN_CONTACTS); })} disabled={displayContacts.length === 0}>Select this page</Button>
              <Button variant="secondary" size="sm" onClick={() => { setContactIds([]); setResendRecipients([]); }} disabled={!contactIds.length}>Clear contacts</Button>
            </div>
            {contactsLoading ? (
              <p className="text-supporting text-text-secondary">Loading contacts…</p>
            ) : displayContacts.length === 0 ? (
              <p className="text-supporting text-text-secondary">{usePaginatedContacts ? 'No contacts found. Try a different search.' : 'Add at least one contact before launching a campaign.'}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {displayContacts.map((contact) => {
                  const recipient = eligibility.result?.recipients.find(r => r.contactId === contact.id);
                  const badgeReason = recipient?.primaryReason;
                  const preSelectStatus = !badgeReason ? recipientStatuses.get(contact.id) : null;
                  const preSelectReason = preSelectStatus?.classification === 'PREVIOUSLY_SENT' ? 'PREVIOUSLY_SENT'
                    : preSelectStatus?.classification === 'PENDING' ? 'PENDING'
                    : preSelectStatus?.classification === 'DELIVERY_UNKNOWN' ? 'DELIVERY_UNKNOWN'
                    : null;
                  return (
                    <label
                      key={contact.id}
                      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-neutral-200 bg-background p-3 text-sm transition-colors hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        checked={contactIds.includes(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                        className="mt-1 h-4 w-4 rounded-[var(--radius-sm)] border-neutral-300 text-information focus:ring-2 focus:ring-information"
                      />
                      <span className="flex-1">
                        <span className="block font-medium text-text-primary">{contact.label}</span>
                        {contact.description && (
                          <span className="block text-caption text-text-secondary">{contact.description}</span>
                        )}
                        {badgeReason && (
                          <Badge variant={reasonBadgeVariant(badgeReason)} title={reasonTooltip(badgeReason)}>{reasonLabel(badgeReason)}</Badge>
                        )}
                        {!badgeReason && preSelectReason && (
                          <Badge variant={reasonBadgeVariant(preSelectReason)} title={reasonTooltip(preSelectReason)}>{reasonLabel(preSelectReason)}</Badge>
                        )}
                        {!badgeReason && !preSelectReason && recipientStatusLoading && (
                          <span className="inline-block h-5 w-24 animate-pulse rounded-full bg-neutral-200" aria-label="Checking status" />
                        )}
                        {!badgeReason && !preSelectReason && !recipientStatusLoading && recipientStatusDone && (
                          <Badge variant="success" title="This contact is eligible to receive emails with this template and sending account.">Eligible</Badge>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {usePaginatedContacts && contactTotalPages > 1 && (
              <Pagination page={contactPage} totalPages={contactTotalPages} onPageChange={setContactPage} />
            )}
            {errors.contactIds && <p className="text-xs text-error">{errors.contactIds}</p>}
          </fieldset>
        ) : step === 3 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {isZeroEligible && (
              <div className="md:col-span-2 rounded-[var(--radius-md)] border border-error/30 bg-error-light p-4" role="alert">
                {eligibility.isFetching ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
                    <p className="font-medium text-text-secondary">Updating…</p>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-error">No emails will be scheduled</p>
                    <p className="mt-1 text-sm text-text-secondary">All selected contacts are excluded. Go back to Contacts to choose eligible recipients or select follow-ups.</p>
                    <Button variant="secondary" size="sm" onClick={() => setStep(2)} className="mt-2">Back to Contacts</Button>
                  </>
                )}
              </div>
            )}
            <DateTimePicker
              label={singleRecipient ? "When to send" : "Start time"}
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              error={errors.startAt}
              required
            />
            <TimezoneSelect
              label="Timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              error={errors.timezone}
              required
            />
            {!singleRecipient && <><div className="space-y-2"><Input
              label="Time between emails (minutes)"
              aria-describedby="interval-help"
              type="number"
              min={1}
              step={1}
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
              error={errors.intervalMinutes}
              required
            />
            <p id="interval-help" className="text-sm text-text-secondary">Space out your emails. For example, 5 means one email every 5 minutes.</p></div>
            <div className="space-y-2"><Input
              label="Emails per day (optional)"
              aria-describedby="daily-help"
              type="number"
              min={1}
              step={1}
              value={dailyLimit}
              onChange={(event) => setDailyLimit(event.target.value)}
              error={errors.dailyLimit}
            />
            <p id="daily-help" className="text-sm text-text-secondary">{eligibility.isFetching ? 'Updating recipient count…' : `You have ${effectiveCount} emails total.${userDailyLimit ? ` Your daily email limit is ${userDailyLimit}, so at most ${Math.min(effectiveCount, userDailyLimit)} will send per day.` : ''} Leave blank for no campaign cap.`}</p>
            <Button variant="secondary" size="sm" onClick={() => setDailyLimit('')} disabled={!dailyLimit}>Use no daily cap</Button></div></>}
            <div className="md:col-span-2"><SchedulePreview startAt={startAt} timezone={timezone} intervalMinutes={intervalMinutes} dailyLimit={dailyLimit} count={effectiveCount} loading={eligibility.isFetching} recipients={previewRecipients} /></div>
            <p className="md:col-span-2 text-sm text-text-secondary">Personalization values are captured when the campaign is scheduled. Editing contacts afterward will not affect already-scheduled emails.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-section-title font-semibold text-text-primary">Ready to launch</h3>
              <p className="mt-1 text-body text-text-secondary">Review the campaign before scheduling emails.</p>
            </div>
            {isZeroEligible && (
              <div className="rounded-[var(--radius-md)] border border-error/30 bg-error-light p-4" role="alert">
                {eligibility.isFetching ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-information" aria-hidden="true" />
                    <p className="font-medium text-text-secondary">Updating…</p>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-error">No eligible recipients</p>
                    <p className="mt-1 text-sm text-text-secondary">All selected contacts are excluded. Go back to Contacts to choose eligible recipients or select follow-ups.</p>
                    <Button variant="secondary" size="sm" onClick={() => setStep(2)} className="mt-2">Back to Contacts</Button>
                  </>
                )}
              </div>
            )}
            {eligibility.isFetching && (
              <p className="text-sm text-text-secondary" aria-live="polite">{eligibility.isChecking ? 'Checking recipient summary…' : 'Updating recipient summary…'}</p>
            )}
            {(eligibility.status === 'error' || submitError || (hasUnknownTokens && unknownTokenAction === 'fix')) && (
              <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-1">
                {eligibility.status === 'error' && (
                  <p className="text-sm text-error">
                    {eligibility.errorMessage}
                    <button type="button" onClick={eligibility.retry} className="ml-2 text-information hover:underline">Try again</button>
                  </p>
                )}
                {hasUnknownTokens && unknownTokenAction === 'fix' && (
                  <p className="text-sm text-error">Unknown tokens must be fixed or explicitly continued: {eligibility.result!.unknownTokens.join(', ')}</p>
                )}
                {submitError && (
                  <p className="text-sm text-error">{submitError}</p>
                )}
              </div>
            )}
            <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <dt className="text-caption text-text-secondary">Campaign</dt>
                <dd className="font-medium text-text-primary">{name || 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Sending account</dt>
                <dd className="font-medium text-text-primary">{selected.emailAccount?.label ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Attachments</dt>
                <dd className="font-medium text-text-primary">{selectedAttachments.length ? selectedAttachments.map(file => file.label).join(', ') : 'No attachments'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Template</dt>
                <dd className="font-medium text-text-primary">{selected.template?.label ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Recipients</dt>
                <dd className="font-medium text-text-primary">{eligibility.isFetching ? 'Updating…' : `${effectiveCount} ${effectiveCount === 1 ? 'email' : 'emails'}${hasExclusions ? ` (${contactIds.length} selected, ${eligibility.result!.excludedCount} excluded)` : ''}`}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Schedule</dt>
                <dd className="font-medium text-text-primary">
                  Starts {formatScheduledTime(zonedDateTimeToIso(startAt, timezone.trim()), timezone.trim())}{!singleRecipient && <> every {intervalMinutes} minutes</>}
                </dd>
              </div>
              {!singleRecipient && <div>
                <dt className="text-caption text-text-secondary">Emails per day</dt>
                <dd className="font-medium text-text-primary">{dailyLimit.trim() || 'No campaign limit'}</dd>
              </div>}
              {followUpSelectedCount > 0 && <div>
                <dt className="text-caption text-text-secondary">Follow-ups</dt>
                <dd className="font-medium text-text-primary">{followUpSelectedCount} {followUpSelectedCount === 1 ? 'recipient' : 'recipients'} chosen for follow-up</dd>
              </div>}
            </dl>
            <SchedulePreview startAt={startAt} timezone={timezone} intervalMinutes={intervalMinutes} dailyLimit={dailyLimit} count={effectiveCount} loading={eligibility.isFetching} recipients={previewRecipients} />
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || submitting}>
          Back
        </Button>
        {step === steps.length - 1 ? (
          <Button onClick={submit} disabled={!canSubmit || loading || submitting || eligibility.isFetching}>
            {eligibility.isFetching ? 'Checking…' : submitting ? 'Scheduling…' : `Schedule ${effectiveCount} ${effectiveCount === 1 ? 'email' : 'emails'}`}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={(loading && step > 0 && emailAccounts.length === 0) || ((step === 2 || step === 3) && isZeroEligible) || ((step === 2 || step === 3) && eligibility.isFetching) || (step === 2 && recipientStatusLoading)}>
            {(step === 2 || step === 3) && eligibility.isFetching ? 'Checking…' : step === 2 && recipientStatusLoading ? 'Checking…' : (step === 2 || step === 3) && isZeroEligible ? 'No eligible recipients' : 'Continue'}
          </Button>
        )}
      </div>
    </div>
  );
}
