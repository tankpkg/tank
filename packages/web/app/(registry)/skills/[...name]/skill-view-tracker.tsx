'use client';

import { useEffect } from 'react';
import { trackSkillView } from '@/lib/analytics';

export function SkillViewTracker({ name, score }: { name: string; score: number | null }) {
  useEffect(() => {
    trackSkillView(name, score);
  }, [name, score]);

  return null;
}
