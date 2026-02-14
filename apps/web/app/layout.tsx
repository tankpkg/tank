import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tank — Security-first package manager for AI agent skills',
  description: 'Publish, install, and audit AI agent skills with integrity verification and permission budgets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
