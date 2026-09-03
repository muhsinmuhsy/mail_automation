'use client';

import {
  CampaignWizard,
  type CampaignSelectOption,
  type CampaignSubmitData,
} from './CampaignWizard';

interface CampaignFormProps {
  emailAccounts?: CampaignSelectOption[];
  resumes?: CampaignSelectOption[];
  templates?: CampaignSelectOption[];
  contacts?: CampaignSelectOption[];
  loading?: boolean;
  onSubmit: (data: CampaignSubmitData) => void;
}

export function CampaignForm({
  emailAccounts,
  resumes,
  templates,
  contacts,
  loading,
  onSubmit,
}: CampaignFormProps) {
  return (
    <CampaignWizard
      emailAccounts={emailAccounts}
      resumes={resumes}
      templates={templates}
      contacts={contacts}
      loading={loading}
      onSubmit={onSubmit}
    />
  );
}
