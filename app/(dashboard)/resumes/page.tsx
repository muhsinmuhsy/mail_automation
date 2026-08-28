'use client';

import { ResumeCard } from '@/components/resumes/ResumeCard';
import { ResumeUpload } from '@/components/resumes/ResumeUpload';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState } from 'react';

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Array<{ id: string; filename: string; size_bytes: number; is_default: boolean }>>([]);

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
          <ResumeUpload onUpload={(file) => {
            setResumes((prev) => [...prev, { id: Date.now().toString(), filename: file.name, size_bytes: file.size, is_default: prev.length === 0 }]);
          }} />
        </div>
      </div>

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
