import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background px-4">
      <main className="w-full max-w-3xl flex flex-col items-center gap-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-text-primary">
          Mail Automation
        </h1>
        <p className="text-lg text-text-secondary max-w-md">
          Automated email campaign manager built with Next.js, Neon, and Cloudflare Workers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-[var(--radius-md)] bg-information px-6 text-base font-medium text-white hover:bg-information/90 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-[var(--radius-md)] border border-neutral-200 bg-background px-6 text-base font-medium text-text-primary hover:bg-selected transition-colors"
          >
            Create account
          </Link>
        </div>
      </main>
    </div>
  );
}
