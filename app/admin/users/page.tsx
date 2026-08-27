'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  daily_email_limit_override: number | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((res) => {
        const json = res as { success: boolean; data: User[]; error?: { message: string } };
        if (json.success) setUsers(json.data);
        else setError(json.error?.message || 'Failed to load users.');
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  const updateUser = async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json() as { success: boolean; data: User };
    if (result.success) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...result.data } : u)));
    }
  };

  if (loading) return <div className="text-text-secondary">Loading users...</div>;
  if (error) return <div className="text-error">{error}</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-2 text-text-secondary">Manage user accounts and limits.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Daily Limit</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-4 text-sm">{user.email}</td>
                <td className="px-4 py-4 text-sm">{user.role}</td>
                <td className="px-4 py-4 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {user.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm">{user.daily_email_limit_override ?? 'Default'}</td>
                <td className="px-4 py-4 text-right text-sm">
                  <button
                    onClick={() => updateUser(user.id, { is_active: !user.is_active })}
                    className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
                  >
                    {user.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
