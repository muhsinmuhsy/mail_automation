'use client';

export default function TemplatesPage() {

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Templates</h1>
        <p className="mt-2 text-text-secondary">Create and manage email templates.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Create template</h2>
        <form className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input
              id="name"
              type="text"
              required
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="subject" className="text-sm font-medium">Subject</label>
            <input
              id="subject"
              type="text"
              required
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="body" className="text-sm font-medium">Body</label>
            <textarea
              id="body"
              required
              rows={6}
              className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Create template
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-medium">Your templates</h3>
        </div>
        <div className="p-4 text-center text-sm text-text-secondary">
          No templates yet.
        </div>
      </div>
    </div>
  );
}
