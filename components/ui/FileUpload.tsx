'use client';

interface FileUploadProps {
  onFileChange: (file: File | null) => void;
  accept?: string;
  maxSizeMB?: number;
  error?: string;
}

export function FileUpload({ onFileChange, accept = '.pdf', maxSizeMB = 5, error }: FileUploadProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          if (file && file.size > maxSizeMB * 1024 * 1024) {
            return;
          }
          onFileChange(file);
        }}
        className="text-sm"
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
