export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-text-secondary">Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Emails sent today</p>
          <p className="mt-2 text-3xl font-semibold">18/20</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Queued</p>
          <p className="mt-2 text-3xl font-semibold">12</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Active campaigns</p>
          <p className="mt-2 text-3xl font-semibold">3</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Failed</p>
          <p className="mt-2 text-3xl font-semibold text-error">2</p>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Recent campaigns</h2>
        <div className="mt-4 rounded-lg border border-gray-200 bg-white">
          <div className="p-4 text-center text-sm text-text-secondary">
            No campaigns yet. Create your first campaign to get started.
          </div>
        </div>
      </div>
    </div>
  );
}
