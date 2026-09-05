'use client';

import {
  CampaignWizard,
  type CampaignSelectOption,
  type CampaignSubmitData,
} from './CampaignWizard';

interface CampaignFormProps {
  emailAccounts?: CampaignSelectOption[];
  attachments?: CampaignSelectOption[];
  templates?: CampaignSelectOption[];
  contacts?: CampaignSelectOption[];
  loading?: boolean;
  onSubmit: (data: CampaignSubmitData) => void;
}

export function CampaignForm({
  emailAccounts,
  attachments,
  templates,
  contacts,
  loading,
  onSubmit,
}: CampaignFormProps) {
  return (
    <CampaignWizard
      emailAccounts={emailAccounts}
      attachments={attachments}
      templates={templates}
      contacts={contacts}
      loading={loading}
      onSubmit={onSubmit}
    />
  );
}
