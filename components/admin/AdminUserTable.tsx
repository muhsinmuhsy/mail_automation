'use client';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export function AdminUserTable({ users }: { users: User[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="px-4 py-3 text-left font-medium text-text-secondary">Email</th>
            <th className="px-4 py-3 text-left font-medium text-text-secondary">Name</th>
            <th className="px-4 py-3 text-left font-medium text-text-secondary">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3 text-text-primary">{user.email}</td>
              <td className="px-4 py-3 text-text-primary">{user.name}</td>
              <td className="px-4 py-3 text-text-secondary">{user.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
