'use client';

import { AdminUserTable } from '@/components/admin/AdminUserTable';
import { useState, useEffect } from 'react';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  daily_email_limit_override: number | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((res) => {
        const json = res as { success: boolean; data: AdminUser[]; error?: { message: string } };
        if (json.success) setUsers(json.data);
        else setError(json.error?.message || 'Failed to load users.');
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-text-secondary">Loading users...</div>;
  if (error) return <div className="text-error">{error}</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-2 text-text-secondary">Manage user accounts and limits.</p>
      </div>

      <AdminUserTable users={users} />
    </div>
  );
}
