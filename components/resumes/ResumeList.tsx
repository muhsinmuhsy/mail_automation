'use client';

interface Resume {
  id: string;
  filename: string;
  size_bytes: number;
  is_default: boolean;
}

export function ResumeList({ resumes }: { resumes: Resume[] }) {
  return (
    <div className="flex flex-col gap-4">
      {resumes.map((resume) => (
        <div key={resume.id} className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-text-primary">{resume.filename}</p>
            <p className="text-sm text-text-secondary">{(resume.size_bytes / 1024).toFixed(1)} KB</p>
          </div>
          {resume.is_default && <span className="text-xs font-medium text-information">Default</span>}
        </div>
      ))}
    </div>
  );
}
