'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OrgMember {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

export function MemberList({ orgId, members }: { orgId: string; members: OrgMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onRemove = (memberId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}`,
          { method: 'DELETE' },
        );

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to remove member.');
          return;
        }

        router.refresh();
      } catch {
        setError('Unexpected error while removing member.');
      }
    });
  };

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <div
          key={member.id}
          className="rounded-md border p-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-1">
            <p className="font-medium">{member.name ?? 'Unnamed user'}</p>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {member.role}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRemove(member.id)}
              disabled={isPending}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members found.</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
