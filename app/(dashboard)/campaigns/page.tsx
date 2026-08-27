'use client';

import { useState } from 'react';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string }>>([]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-2 text-text-secondary">Create and manage your email campaigns.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Create campaign</h2>
        <form className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">Campaign name</label>
            <input
              id="name"
              type="text"
              required
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="email_account" className="text-sm font-medium">Sending account</label>
            <select
              id="email_account"
              required
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select account</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="resume" className="text-sm font-medium">Resume</label>
            <select
              id="resume"
              required
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select resume</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="template" className="text-sm font-medium">Template</label>
            <select
              id="template"
              required
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select template</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Create campaign
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-medium">Your campaigns</h3>
        </div>
        <div className="p-4 text-center text-sm text-text-secondary">
          No campaigns yet.
        </div>
      </div>
    </div>
  );
}
