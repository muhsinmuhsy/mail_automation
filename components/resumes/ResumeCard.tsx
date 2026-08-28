'use client';

interface Resume {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
}

export function ResumeCard({ resume }: { resume: Resume }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{resume.filename}</p>
      <p className="text-sm text-text-secondary">{(resume.size_bytes / 1024).toFixed(1)} KB</p>
    </div>
  );
}
