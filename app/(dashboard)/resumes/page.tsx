'use client';

import { ResumeCard } from '@/components/resumes/ResumeCard';
import { ResumeUpload } from '@/components/resumes/ResumeUpload';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEffect, useState } from 'react';

type Resume = { id: string; filename: string; size_bytes: number; is_default: boolean };
type ApiResponse<T> = { data: T; message?: string };

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/resumes');
        const payload = (await response.json()) as ApiResponse<Resume[]>;
        if (!active) return;
        if (!response.ok) throw new Error(payload.message || 'Unable to load resumes.');
        setResumes(payload.data);
      } catch (cause) {
        if (!active) return;
        setError((cause as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Resumes</h1>
        <p className="mt-2 text-text-secondary">Upload and manage your resumes.</p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
        <h2 className="text-lg font-semibold text-text-primary">Upload resume</h2>
        <p className="text-sm text-text-secondary">PDF files only, max 5MB.</p>
        <div className="mt-4">
          <ResumeUpload onUpload={async (file) => {
            setError(null);
            const formData = new FormData(); formData.append('file', file);
            const response = await fetch('/api/resumes', { method: 'POST', body: formData });
            const payload = await response.json() as ApiResponse<Resume>;
            if (!response.ok) { const message = payload.message || 'Unable to upload resume.'; setError(message); throw new Error(message); }
            setResumes((previous) => [...previous, payload.data]);
          }} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {resumes.length === 0 ? (
        <EmptyState
          title="No resumes uploaded yet"
          description="Upload your first resume to get started."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {resumes.map((resume) => (
            <ResumeCard key={resume.id} resume={resume} />
          ))}
        </div>
      )}
    </div>
  );
}
