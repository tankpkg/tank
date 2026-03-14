'use client';

import { Star } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { trackSkillStar } from '@/lib/analytics';

interface StarButtonProps {
  skillName: string;
  initialStarCount: number;
  initialIsStarred: boolean;
}

export function StarButton({ skillName, initialStarCount, initialIsStarred }: StarButtonProps) {
  const [starCount, setStarCount] = useState(initialStarCount);
  const [isStarred, setIsStarred] = useState(initialIsStarred);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      try {
        const method = isStarred ? 'DELETE' : 'POST';
        const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillName)}/star`, { method });

        if (res.ok) {
          const data = await res.json();
          setStarCount(data.starCount);
          setIsStarred(data.isStarred);
          trackSkillStar(skillName, data.isStarred);
        }
      } catch (error) {
        console.error('Failed to toggle star:', error);
      }
    });
  };

  return (
    <Button
      variant={isStarred ? 'default' : 'outline'}
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      className="gap-1.5">
      <Star className={`h-4 w-4 ${isStarred ? 'fill-current' : ''}`} />
      <span>{starCount.toLocaleString()}</span>
    </Button>
  );
}
