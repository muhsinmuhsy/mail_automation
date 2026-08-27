export default function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Admin Dashboard</h1>
        <p className="mt-2 text-text-secondary">System overview and management.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Total users</p>
          <p className="mt-2 text-3xl font-semibold">--</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Emails sent today</p>
          <p className="mt-2 text-3xl font-semibold">--</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Global daily limit</p>
          <p className="mt-2 text-3xl font-semibold">500</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary">Sending enabled</p>
          <p className="mt-2 text-3xl font-semibold text-success">Yes</p>
        </div>
      </div>
    </div>
  );
}
