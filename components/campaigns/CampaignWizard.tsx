'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CampaignForm } from './CampaignForm';

const steps = ['Campaign', 'Content', 'Contacts', 'Schedule', 'Review'];

export function CampaignWizard({ onSubmit }: { onSubmit: (data: unknown) => void }) {
  const [step, setStep] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {steps.map((label, index) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`text-sm font-medium ${index <= step ? 'text-information' : 'text-text-secondary'}`}>
              {String(index + 1).padStart(2, '0')} {label}
            </span>
            {index < steps.length - 1 && <span className="text-text-secondary">—</span>}
          </div>
        ))}
      </div>
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-6">
        <CampaignForm onSubmit={onSubmit} />
      </div>
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={step === steps.length - 1}>
          Continue
        </Button>
      </div>
    </div>
  );
}
