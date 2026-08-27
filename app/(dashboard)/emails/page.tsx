'use client';

export default function EmailsPage() {

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Emails</h1>
        <p className="mt-2 text-text-secondary">View your email sending history.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-medium">Email history</h3>
        </div>
        <div className="p-4 text-center text-sm text-text-secondary">
          No emails sent yet.
        </div>
      </div>
    </div>
  );
}
