'use client';

import { useState } from 'react';

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string; provider: string }>>([]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Email Accounts</h1>
        <p className="mt-2 text-text-secondary">Manage your email sending accounts.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Connect Gmail</h2>
          <form className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input
                id="email"
                type="email"
                required
                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="secret" className="text-sm font-medium">App Password</label>
              <input
                id="secret"
                type="password"
                required
                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Connect
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="p-4">
            <h3 className="font-medium">Connected accounts</h3>
          </div>
          <div className="p-4 text-center text-sm text-text-secondary">
            No email accounts connected yet.
          </div>
        </div>
      </div>
    </div>
  );
}
