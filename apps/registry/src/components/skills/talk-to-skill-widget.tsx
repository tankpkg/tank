import { encodeSkillName } from '@internals/helpers';
import { Loader2, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';

const WIDGET_SCRIPT_URL = 'https://storage.googleapis.com/alice-and-bot/widget/dist/widget.iife.js';

interface AliceAndBotGlobal {
  loadChatWidget: (opts: { initialMessage: string; dialingTo: string; container?: HTMLElement }) => void;
}

interface TalkToSkillWidgetProps {
  skillName: string;
  chatLink: string | null;
  botPublicKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TalkToSkillWidget({ skillName, chatLink, botPublicKey, open, onOpenChange }: TalkToSkillWidgetProps) {
  const [resolvedBotKey, setResolvedBotKey] = useState<string | null>(botPublicKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const widgetLoadedRef = useRef(false);

  const ensureBot = useCallback(async () => {
    if (resolvedBotKey) return;

    setLoading(true);
    setError(null);

    try {
      const encoded = encodeSkillName(skillName);
      const res = await fetch(`/api/v1/skills/${encoded}/talk`, { method: 'POST' });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError((body as { error?: string }).error ?? 'Failed to create chat');
        return;
      }

      const data = (await res.json()) as { chatLink: string; botPublicKey: string | null };
      if (data.botPublicKey) {
        setResolvedBotKey(data.botPublicKey);
      } else {
        setError('Chat is not fully configured yet');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [skillName, resolvedBotKey]);

  const handleOpen = useCallback(() => {
    onOpenChange(true);
    ensureBot();
  }, [onOpenChange, ensureBot]);

  useEffect(() => {
    if (!open || !resolvedBotKey || widgetLoadedRef.current) return;
    if (!chatContainerRef.current) return;

    const container = chatContainerRef.current;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const global = (window as unknown as { aliceAndBot?: AliceAndBotGlobal }).aliceAndBot;
      if (global) {
        global.loadChatWidget({
          initialMessage: `Hi! Tell me about the ${skillName} skill.`,
          dialingTo: resolvedBotKey,
          container
        });
        widgetLoadedRef.current = true;
      }
    };
    container.appendChild(script);

    return () => {
      widgetLoadedRef.current = false;
    };
  }, [open, resolvedBotKey, skillName]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-full bg-[#10b981] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0d9e6e] focus:outline-none focus:ring-2 focus:ring-[#10b981]/50 focus:ring-offset-2 focus:ring-offset-background"
        aria-label="Talk to this skill"
        data-testid="talk-bubble">
        <MessageCircle className="size-5" />
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-medium">Talk to {skillName}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 flex-1 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <p className="text-sm">Setting up your chat…</p>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center gap-3 flex-1 text-center px-4">
                <p className="text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
                <Button variant="outline" size="sm" onClick={() => ensureBot()}>
                  Try again
                </Button>
              </div>
            )}

            {!loading && !error && resolvedBotKey && (
              <div ref={chatContainerRef} className="flex-1 min-h-0" data-testid="chat-container" />
            )}
          </div>

          <div className="px-4 py-2 border-t text-center shrink-0">
            <p className="text-[11px] text-muted-foreground">
              Powered by{' '}
              <a
                href="https://prompt2bot.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground">
                prompt2bot
              </a>
              {' · '}
              <a
                href="https://aliceandbot.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground">
                alice&bot
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
