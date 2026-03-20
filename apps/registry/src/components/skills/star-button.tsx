import { Star } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';

import { Button } from '~/components/ui/button';

interface StarButtonProps {
  skillName: string;
  initialStarred: boolean;
  initialCount: number;
}

export function StarButton({ skillName, initialStarred, initialCount }: StarButtonProps) {
  const [starred, setStarred] = useState(initialStarred);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  const toggle = useCallback(() => {
    const newStarred = !starred;
    startTransition(async () => {
      try {
        const method = newStarred ? 'POST' : 'DELETE';
        const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillName)}/star`, { method });

        if (res.ok) {
          setStarred(newStarred);
          setCount((c) => c + (newStarred ? 1 : -1));
        }
      } catch {
        // revert on error — state unchanged
      }
    });
  }, [starred, skillName]);

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle} disabled={isPending}>
      <Star className={`size-3.5 ${starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
      <span className="text-xs">{count}</span>
    </Button>
  );
}
