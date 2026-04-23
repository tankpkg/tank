import { Loader2, MessageCircle } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const WIDGET_SCRIPT_URL = 'https://storage.googleapis.com/alice-and-bot/widget/dist/widget.iife.js';
const WIDGET_ROOT_ID = 'alice-and-bot-widget-root';
const CREDENTIALS_KEY = 'aliceAndBotCredentials';

const TANK_WIDGET_CSS = `
  :host {
    font-family: 'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif !important;
  }

  /* Chat panel container (outer floating panel) - legacy + no-space fallbacks */
  div[style*="position: absolute"][style*="border-radius: 12px"],
  div[style*="position:absolute"][style*="border-radius:12px"] {
    border: 1px solid oklch(0.25 0.01 155) !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6) !important;
    width: min(480px, 92vw) !important;
    height: min(85dvh, 800px) !important;
  }

  /* Chat container (inner shell) */
  [data-testid="chat-container"] {
    background: oklch(0.05 0.003 155) !important;
    color: oklch(0.93 0.01 155) !important;
  }

  /* Header bar */
  [data-testid="title-bar"] {
    font-family: 'Space Grotesk Variable', 'Space Grotesk', sans-serif !important;
    font-size: 0.875rem !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em !important;
    padding: 12px 16px !important;
    background: oklch(0.08 0.005 155) !important;
    border-bottom: 1px solid oklch(0.2 0.01 155) !important;
    color: oklch(0.93 0.01 155) !important;
  }
  [data-testid="title-text"] {
    color: oklch(0.93 0.01 155) !important;
  }

  /* Message list area */
  [data-testid="message-list"] {
    background: oklch(0.05 0.003 155) !important;
  }

  /* Message list inner padding */
  [data-content-inner] {
    padding: 12px 8px 72px !important;
  }

  /* User message bubbles */
  .msg-bubble[style*="rgb(16, 185, 129)"],
  .msg-bubble[style*="rgb(16,185,129)"] {
    background: #10b981 !important;
    border-radius: 12px 12px 4px 12px !important;
    padding: 10px 14px !important;
    font-size: 0.875rem !important;
    line-height: 1.5 !important;
  }

  /* Bot message bubbles */
  .msg-bubble[style*="rgb(42, 42, 42)"],
  .msg-bubble[style*="rgb(42,42,42)"] {
    background: oklch(0.12 0.005 155) !important;
    border: 1px solid oklch(0.2 0.01 155) !important;
    border-radius: 12px 12px 12px 4px !important;
    padding: 10px 14px !important;
    font-size: 0.875rem !important;
    line-height: 1.5 !important;
    color: oklch(0.93 0.01 155) !important;
  }

  /* Bot name label */
  .msg-bubble b[style*="font-size: 11px"],
  .msg-bubble b[style*="font-size:11px"] {
    color: #10b981 !important;
    font-size: 0.6875rem !important;
    font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace !important;
    letter-spacing: 0.02em !important;
  }

  /* Code blocks */
  code {
    background: oklch(0.15 0.005 155) !important;
    border: 1px solid oklch(0.22 0.01 155) !important;
    border-radius: 6px !important;
    padding: 1px 6px !important;
    font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace !important;
    font-size: 0.8125rem !important;
  }

  /* Timestamps */
  span[style*="font-size: 10px"],
  span[style*="font-size:10px"] {
    font-size: 0.625rem !important;
    opacity: 0.5 !important;
  }

  /* Avatar */
  div[style*="border-radius: 50%"][style*="width: 32px"],
  div[style*="border-radius:50%"][style*="width:32px"] {
    background: #10b981 !important;
    box-shadow: 0 0 0 2px oklch(0.08 0.005 155) !important;
  }

  /* Input wrapper (new: data-input-area; legacy style fallbacks) */
  [data-input-area],
  div[style*="position: absolute"][style*="bottom: 0"],
  div[style*="position:absolute"][style*="bottom:0"] {
    padding: 8px 12px !important;
    background: oklch(0.05 0.003 155) !important;
    border-top: 1px solid oklch(0.2 0.01 155) !important;
  }

  /* Textarea (new: message-input testid; fallback: bare textarea) */
  [data-testid="message-input"],
  textarea {
    background: oklch(0.1 0.005 155) !important;
    border: 1px solid oklch(0.22 0.01 155) !important;
    border-radius: 12px !important;
    font-size: 0.875rem !important;
    padding: 10px 40px 10px 16px !important;
    color: oklch(0.93 0.01 155) !important;
    transition: border-color 0.15s !important;
  }
  [data-testid="message-input"]:focus,
  textarea:focus {
    border-color: #10b981 !important;
    outline: none !important;
    box-shadow: none !important;
  }
  [data-testid="message-input"]::placeholder,
  textarea::placeholder {
    color: oklch(0.45 0.01 155) !important;
  }

  /* Send button */
  [data-testid="send-button"] {
    background: oklch(0.1 0.005 155) !important;
    color: oklch(0.93 0.01 155) !important;
  }
  [data-testid="send-button"]:hover {
    background: oklch(0.15 0.005 155) !important;
  }

  /* Mic button (legacy fallback - new widget uses send-button testid) */
  button[title="Record audio"] {
    background: oklch(0.1 0.005 155) !important;
    border: 1px solid oklch(0.22 0.01 155) !important;
    color: oklch(0.93 0.01 155) !important;
  }
  button[title="Record audio"]:hover {
    background: oklch(0.15 0.005 155) !important;
  }

  /* Header close/call buttons */
  button[title="Close chat"],
  button[title="Start voice call"] {
    opacity: 0.5 !important;
  }
  button[title="Close chat"]:hover,
  button[title="Start voice call"]:hover {
    opacity: 1 !important;
  }

  /* Redundant close overlay */
  button[aria-label="Close chat"] {
    display: none !important;
  }

  /* Scrollbar */
  [data-scrollable],
  div[data-scrollable="true"] {
    scrollbar-color: oklch(0.25 0.01 155) transparent !important;
    scrollbar-width: thin !important;
  }

  /* Kebab */
  .msg-kebab { opacity: 0 !important; }
  .msg-bubble:hover .msg-kebab { opacity: 0.4 !important; }

  /* Attach button (new: attach-button testid; legacy title fallback) */
  [data-testid="attach-button"],
  button[title="Attach"] {
    color: oklch(0.45 0.01 155) !important;
  }
  [data-testid="attach-button"]:hover,
  button[title="Attach"]:hover {
    color: oklch(0.7 0.01 155) !important;
  }

  /* Hide alice-and-bot blue button (legacy + no-space) */
  button[style*="border-radius: 999px"],
  button[style*="border-radius:999px"] {
    display: none !important;
  }

  /* Leave room for the attribution bar above the input */
  #tank-attribution + div,
  #tank-attribution {
    pointer-events: auto;
  }
`;

interface TalkToSkillWidgetProps {
  skillName: string;
  chatLink: string | null;
  botPublicKey: string | null;
}

export interface TalkToSkillWidgetHandle {
  trigger: () => void;
}

type WidgetApi = {
  loadChatWidget: (opts: {
    participants: string[];
    initialMessage?: string;
    startOpen?: boolean;
    defaultName?: string;
    colorScheme?: { dark: { primary: string; background: string } };
  }) => void;
};

function getShadowRoot(): ShadowRoot | null {
  const host = document.querySelector(`#${WIDGET_ROOT_ID} div[dir="ltr"]`);
  return (host as HTMLElement)?.shadowRoot ?? null;
}

function findInputWrapper(shadow: ShadowRoot): Element | null {
  return (
    shadow.querySelector('[data-input-area]') ??
    shadow.querySelector('div[style*="position: absolute"][style*="bottom: 0"]') ??
    shadow.querySelector('div[style*="position:absolute"][style*="bottom:0"]')
  );
}

function findToggleButton(shadow: ShadowRoot): HTMLElement | null {
  return (
    (shadow.querySelector('button[style*="border-radius: 999px"]') as HTMLElement | null) ??
    (shadow.querySelector('button[style*="border-radius:999px"]') as HTMLElement | null)
  );
}

function injectAttribution(): void {
  const shadow = getShadowRoot();
  if (!shadow || shadow.querySelector('#tank-attribution')) return;
  const inputWrapper = findInputWrapper(shadow);
  if (!inputWrapper) return;
  const bar = document.createElement('div');
  bar.id = 'tank-attribution';
  bar.style.cssText =
    'text-align:center;font-size:10px;color:oklch(0.4 0.01 155);padding:4px 0 2px;pointer-events:auto;';
  bar.innerHTML =
    'Powered by <a href="https://prompt2bot.com" target="_blank" rel="noopener noreferrer" style="color:oklch(0.5 0.01 155);text-decoration:underline;text-underline-offset:2px">prompt2bot</a> · <a href="https://aliceandbot.com" target="_blank" rel="noopener noreferrer" style="color:oklch(0.5 0.01 155);text-decoration:underline;text-underline-offset:2px">alice&bot</a>';
  inputWrapper.prepend(bar);
}

function watchForAttribution(): void {
  const shadow = getShadowRoot();
  if (!shadow) return;
  const observer = new MutationObserver(() => {
    injectAttribution();
  });
  observer.observe(shadow, { childList: true, subtree: true });
  injectAttribution();
}

function injectWidgetStyles(maxMs = 10000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const shadow = getShadowRoot();
      if (shadow && !shadow.querySelector('#tank-widget-overrides')) {
        const style = document.createElement('style');
        style.id = 'tank-widget-overrides';
        style.textContent = TANK_WIDGET_CSS;
        shadow.appendChild(style);
        watchForAttribution();
        resolve();
        return;
      }
      if (shadow?.querySelector('#tank-widget-overrides') || Date.now() - start > maxMs) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function loadWidget(botPublicKey: string, skillName: string, startOpen: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    document.getElementById(WIDGET_ROOT_ID)?.remove();

    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const w = window as unknown as { aliceAndBot?: WidgetApi };
      if (w.aliceAndBot) {
        w.aliceAndBot.loadChatWidget({
          participants: [botPublicKey],
          initialMessage: `Hi! Tell me about the ${skillName} package.`,
          startOpen,
          defaultName: 'Visitor',
          colorScheme: { dark: { primary: '#10b981', background: '#1a1a1a' } }
        });
      }
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load chat widget'));
    document.body.appendChild(script);
  });
}

function waitForCredentials(maxMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (localStorage.getItem(CREDENTIALS_KEY) || Date.now() - start > maxMs) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function dismissNameDialog(maxMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const cancel = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel');
      if (cancel) {
        (cancel as HTMLElement).click();
        resolve();
        return;
      }
      if (Date.now() - start > maxMs) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function toggleWidgetOpen(): boolean {
  const shadow = getShadowRoot();
  if (!shadow) return false;
  const chatButton = findToggleButton(shadow);
  if (!chatButton) return false;
  chatButton.style.setProperty('display', 'inline-block', 'important');
  chatButton.click();
  requestAnimationFrame(() => chatButton.style.setProperty('display', 'none', 'important'));
  return true;
}

export const TalkToSkillWidget = forwardRef<TalkToSkillWidgetHandle, TalkToSkillWidgetProps>(function TalkToSkillWidget(
  { skillName, botPublicKey },
  ref
) {
  const [resolvedBotKey, setResolvedBotKey] = useState<string | null>(botPublicKey);
  const [loading, setLoading] = useState(false);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    (async () => {
      let key = resolvedBotKey;
      if (!key) {
        const encoded = encodeURIComponent(skillName);
        const res = await fetch(`/api/v1/skills/${encoded}/talk`, { method: 'POST' }).catch(() => null);
        if (!res?.ok) return;
        const data = (await res.json()) as { chatLink: string; botPublicKey: string | null };
        key = data.botPublicKey;
        if (key) setResolvedBotKey(key);
      }
      if (!key) return;

      if (!localStorage.getItem(CREDENTIALS_KEY)) {
        await loadWidget(key, skillName, false);
        await waitForCredentials();
        await dismissNameDialog();
        document.getElementById(WIDGET_ROOT_ID)?.remove();
      }

      await loadWidget(key, skillName, false);
      await injectWidgetStyles();
    })();
  }, [skillName, resolvedBotKey]);

  const handleClick = useCallback(async () => {
    if (toggleWidgetOpen()) return;

    setLoading(true);
    try {
      let key = resolvedBotKey;
      if (!key) {
        const encoded = encodeURIComponent(skillName);
        const res = await fetch(`/api/v1/skills/${encoded}/talk`, { method: 'POST' });
        if (!res.ok) return;
        const data = (await res.json()) as { chatLink: string; botPublicKey: string | null };
        key = data.botPublicKey;
        if (key) setResolvedBotKey(key);
      }
      if (!key) return;

      if (!localStorage.getItem(CREDENTIALS_KEY)) {
        await loadWidget(key, skillName, false);
        await waitForCredentials();
        await dismissNameDialog();
        document.getElementById(WIDGET_ROOT_ID)?.remove();
      }

      await loadWidget(key, skillName, true);
      await dismissNameDialog();
      await injectWidgetStyles();
    } finally {
      setLoading(false);
    }
  }, [skillName, resolvedBotKey]);

  useImperativeHandle(ref, () => ({ trigger: handleClick }), [handleClick]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="fixed bottom-6 right-6 z-[1000000] flex size-12 items-center justify-center rounded-full bg-[#10b981] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0d9e6e] focus:outline-none focus:ring-2 focus:ring-[#10b981]/50 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
      aria-label="Talk to this package"
      data-testid="talk-bubble">
      {loading ? <Loader2 className="size-5 animate-spin" /> : <MessageCircle className="size-5" />}
    </button>
  );
});
