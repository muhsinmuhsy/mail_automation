'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const steps = ['Campaign', 'Content', 'Contacts', 'Schedule', 'Review'];

export interface CampaignSelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface CampaignSubmitData {
  name: string;
  emailAccountId: string;
  resumeId: string;
  templateId: string;
  contactIds: string[];
  startAt: string;
  timezone: string;
  intervalMinutes: number;
  dailyLimit: number | null;
}

interface CampaignWizardProps {
  emailAccounts?: CampaignSelectOption[];
  resumes?: CampaignSelectOption[];
  templates?: CampaignSelectOption[];
  contacts?: CampaignSelectOption[];
  loading?: boolean;
  onSubmit: (data: CampaignSubmitData) => void;
}

function defaultLocalDateTime(): string {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string): string {
  return new Date(value).toISOString();
}

function optionList(label: string, options: CampaignSelectOption[]) {
  if (options.length === 0) return [{ value: '', label }];
  return options.map((option) => ({ value: option.id, label: option.label }));
}

export function CampaignWizard({
  emailAccounts = [],
  resumes = [],
  templates = [],
  contacts = [],
  loading = false,
  onSubmit,
}: CampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [emailAccountId, setEmailAccountId] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(defaultLocalDateTime);
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [intervalMinutes, setIntervalMinutes] = useState('5');
  const [dailyLimit, setDailyLimit] = useState('20');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const effectiveEmailAccountId = emailAccountId || emailAccounts[0]?.id || '';
  const effectiveResumeId = resumeId || resumes[0]?.id || '';
  const effectiveTemplateId = templateId || templates[0]?.id || '';

  const selected = useMemo(
    () => ({
      emailAccount: emailAccounts.find((item) => item.id === effectiveEmailAccountId),
      resume: resumes.find((item) => item.id === effectiveResumeId),
      template: templates.find((item) => item.id === effectiveTemplateId),
    }),
    [effectiveEmailAccountId, effectiveResumeId, effectiveTemplateId, emailAccounts, resumes, templates]
  );

  const validateStep = (targetStep = step) => {
    const nextErrors: Record<string, string> = {};
    if (targetStep === 0 && !name.trim()) {
      nextErrors.name = 'Campaign name is required.';
    }
    if (targetStep === 1) {
      if (!effectiveEmailAccountId) nextErrors.emailAccountId = 'Choose a sending account.';
      if (!effectiveResumeId) nextErrors.resumeId = 'Choose a resume.';
      if (!effectiveTemplateId) nextErrors.templateId = 'Choose a template.';
    }
    if (targetStep === 2 && contactIds.length === 0) {
      nextErrors.contactIds = 'Choose at least one contact.';
    }
    if (targetStep === 3) {
      const parsedInterval = Number(intervalMinutes);
      const parsedLimit = dailyLimit.trim() ? Number(dailyLimit) : null;
      if (!startAt || Number.isNaN(new Date(startAt).getTime())) {
        nextErrors.startAt = 'Choose a valid start time.';
      }
      if (!timezone.trim()) {
        nextErrors.timezone = 'Timezone is required.';
      }
      if (!Number.isInteger(parsedInterval) || parsedInterval <= 0) {
        nextErrors.intervalMinutes = 'Interval must be a positive whole number.';
      }
      if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        nextErrors.dailyLimit = 'Daily limit must be a positive whole number.';
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const canSubmit =
    name.trim() &&
    effectiveEmailAccountId &&
    effectiveResumeId &&
    effectiveTemplateId &&
    contactIds.length > 0 &&
    startAt &&
    timezone.trim() &&
    Number(intervalMinutes) > 0;

  const goNext = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const submit = () => {
    const originalStep = step;
    for (let index = 0; index < steps.length - 1; index += 1) {
      if (!validateStep(index)) {
        setStep(index);
        return;
      }
    }
    setStep(originalStep);
    onSubmit({
      name: name.trim(),
      emailAccountId: effectiveEmailAccountId,
      resumeId: effectiveResumeId,
      templateId: effectiveTemplateId,
      contactIds,
      startAt: localDateTimeToIso(startAt),
      timezone: timezone.trim(),
      intervalMinutes: Number(intervalMinutes),
      dailyLimit: dailyLimit.trim() ? Number(dailyLimit) : null,
    });
  };

  const toggleContact = (id: string) => {
    setContactIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

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

      <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        {loading ? (
          <p className="text-body text-text-secondary">Loading campaign options...</p>
        ) : step === 0 ? (
          <Input
            label="Campaign name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            required
          />
        ) : step === 1 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label="Sending account"
              value={effectiveEmailAccountId}
              onChange={(event) => setEmailAccountId(event.target.value)}
              options={optionList('Select account', emailAccounts)}
              error={errors.emailAccountId}
              required
            />
            <Select
              label="Resume"
              value={effectiveResumeId}
              onChange={(event) => setResumeId(event.target.value)}
              options={optionList('Select resume', resumes)}
              error={errors.resumeId}
              required
            />
            <Select
              label="Template"
              value={effectiveTemplateId}
              onChange={(event) => setTemplateId(event.target.value)}
              options={optionList('Select template', templates)}
              error={errors.templateId}
              required
            />
          </div>
        ) : step === 2 ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-text-primary">Contacts</legend>
            {contacts.length === 0 ? (
              <p className="text-supporting text-text-secondary">Add at least one contact before launching a campaign.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {contacts.map((contact) => (
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
                    <span>
                      <span className="block font-medium text-text-primary">{contact.label}</span>
                      {contact.description && (
                        <span className="block text-caption text-text-secondary">{contact.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {errors.contactIds && <p className="text-xs text-error">{errors.contactIds}</p>}
          </fieldset>
        ) : step === 3 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DateTimePicker
              label="Start time"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              error={errors.startAt}
              required
            />
            <Input
              label="Timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              error={errors.timezone}
              required
            />
            <Input
              label="Interval minutes"
              type="number"
              min={1}
              step={1}
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
              error={errors.intervalMinutes}
              required
            />
            <Input
              label="Daily limit"
              type="number"
              min={1}
              step={1}
              value={dailyLimit}
              onChange={(event) => setDailyLimit(event.target.value)}
              error={errors.dailyLimit}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-section-title font-semibold text-text-primary">Ready to launch</h3>
              <p className="mt-1 text-body text-text-secondary">Review the campaign before scheduling emails.</p>
            </div>
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
                <dt className="text-caption text-text-secondary">Resume</dt>
                <dd className="font-medium text-text-primary">{selected.resume?.label ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Template</dt>
                <dd className="font-medium text-text-primary">{selected.template?.label ?? 'Not selected'}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Contacts</dt>
                <dd className="font-medium text-text-primary">{contactIds.length} selected</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Schedule</dt>
                <dd className="font-medium text-text-primary">
                  Starts {new Date(localDateTimeToIso(startAt)).toLocaleString()} every {intervalMinutes} minutes
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">Daily limit</dt>
                <dd className="font-medium text-text-primary">{dailyLimit.trim() || 'No campaign limit'}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
          Back
        </Button>
        {step === steps.length - 1 ? (
          <Button onClick={submit} disabled={!canSubmit || loading}>
            Start campaign
          </Button>
        ) : (
          <Button onClick={goNext} disabled={loading}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
