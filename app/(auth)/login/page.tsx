import { auth } from '@/lib/auth/neon-auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Sign in to your account
        </p>
      </div>

      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          Sign in
        </button>
      </form>

      <div className="text-center text-sm text-text-secondary">
        <p>
          Don&apos;t have an account?{' '}
          <a href="/register" className="text-information hover:underline">
            Sign up
          </a>
        </p>
        <p className="mt-1">
          <a href="/forgot-password" className="text-information hover:underline">
            Forgot password?
          </a>
        </p>
      </div>
    </div>
  );
}
