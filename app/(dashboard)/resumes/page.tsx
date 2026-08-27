'use client';

export default function ResumesPage() {

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Resumes</h1>
        <p className="mt-2 text-text-secondary">Upload and manage your resumes.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Upload resume</h2>
        <p className="text-sm text-text-secondary">PDF files only, max 5MB.</p>
        <form className="mt-4 flex flex-col gap-4">
          <input
            type="file"
            accept="application/pdf"
            required
            className="text-sm"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Upload
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="p-4">
          <h3 className="font-medium">Your resumes</h3>
        </div>
        <div className="p-4 text-center text-sm text-text-secondary">
          No resumes uploaded yet.
        </div>
      </div>
    </div>
  );
}
