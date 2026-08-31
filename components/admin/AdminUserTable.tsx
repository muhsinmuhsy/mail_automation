'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  /** Present when the admin API returns account status. */
  is_active?: boolean;
  /** `null` means the user falls back to the global default limit. */
  daily_email_limit_override?: number | null;
}

interface AdminUserTableProps {
  users: AdminUserRow[];
  /**
   * Management handlers. When either is supplied the table also renders the
   * status, daily-limit and actions columns; without them it stays read-only.
   */
  onToggleActive?: (user: AdminUserRow) => void;
  onSaveLimit?: (user: AdminUserRow, limit: number) => void;
  /** Id of the user with an action in flight. */
  busyUserId?: string | null;
}

function parseLimit(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function AdminUserTable({ users, onToggleActive, onSaveLimit, busyUserId = null }: AdminUserTableProps) {
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const manageable = Boolean(onToggleActive || onSaveLimit);

  const draftFor = (user: AdminUserRow) =>
    limitDrafts[user.id] ??
    (user.daily_email_limit_override != null ? String(user.daily_email_limit_override) : '');

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-neutral-200 bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="px-4 py-3 text-left font-medium text-text-secondary">Email</th>
            <th className="px-4 py-3 text-left font-medium text-text-secondary">Name</th>
            <th className="px-4 py-3 text-left font-medium text-text-secondary">Role</th>
            {manageable && (
              <>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">Status</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">Daily limit</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">Actions</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const draft = draftFor(user);
            const parsedLimit = parseLimit(draft);
            const busy = busyUserId === user.id;
            return (
              <tr key={user.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 text-text-primary">{user.email}</td>
                <td className="px-4 py-3 text-text-primary">{user.name}</td>
                <td className="px-4 py-3 text-text-secondary">{user.role}</td>
                {manageable && (
                  <>
                    <td className="px-4 py-3">
                      <Badge variant={user.is_active === false ? 'default' : 'success'}>
                        {user.is_active === false ? 'Disabled' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {onSaveLimit ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            aria-label={`Daily email limit for ${user.email}`}
                            placeholder="Default"
                            className="h-8 w-24"
                            value={draft}
                            onChange={(event) =>
                              setLimitDrafts((previous) => ({ ...previous, [user.id]: event.target.value }))
                            }
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy || parsedLimit === null || parsedLimit === user.daily_email_limit_override}
                            onClick={() => {
                              if (parsedLimit !== null) onSaveLimit(user, parsedLimit);
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <span className="text-text-secondary">
                          {user.daily_email_limit_override ?? 'Default'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {onToggleActive ? (
                        <Button
                          variant={user.is_active === false ? 'secondary' : 'destructive'}
                          size="sm"
                          disabled={busy}
                          onClick={() => onToggleActive(user)}
                        >
                          {user.is_active === false ? 'Enable' : 'Disable'}
                        </Button>
                      ) : null}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
