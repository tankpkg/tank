import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { getSelfhostedInstallMethods, INSTALL_METHODS } from '~/consts/brand';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';

export function InstallSelector({ appUrl }: { appUrl?: string }) {
  const methods = appUrl ? getSelfhostedInstallMethods(appUrl) : [...INSTALL_METHODS];
  const [activeMethod, setActiveMethod] = useState(0);
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="w-full max-w-[520px] rounded border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex border-b border-border p-1 gap-0.5">
        {methods.map((method, i) => (
          <button
            key={method.id}
            type="button"
            onClick={() => setActiveMethod(i)}
            className={`flex-1 rounded-sm px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
              i === activeMethod
                ? 'bg-tank/10 text-tank'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}>
            {method.label}
          </button>
        ))}
      </div>

      {/* Command */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto font-mono text-[13px]">
          <span className="text-tank select-none shrink-0">$</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={activeMethod}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="text-muted-foreground whitespace-nowrap">
              {methods[activeMethod].command}
            </motion.span>
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={() => copy(methods[activeMethod].command)}
          className="ml-3 shrink-0 text-muted-foreground/50 hover:text-tank transition-colors duration-150"
          title="Copy to clipboard">
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.svg
                key="check"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-tank">
                <path d="M20 6 9 17l-5-5" />
              </motion.svg>
            ) : (
              <motion.svg
                key="copy"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </motion.svg>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
