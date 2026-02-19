import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a2e' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://tankpkg.dev'),
  title: {
    default: 'Tank — Security-first package manager for AI agent skills',
    template: '%s | Tank',
  },
  description: 'Publish, install, and audit AI agent skills with integrity verification, permission budgets, and 6-stage security scanning. The npm for AI skills.',
  keywords: [
    'Tank',
    'AI skills',
    'AI agent skills',
    'package manager',
    'security',
    'Claude Code',
    'Cursor',
    'AI agents',
    'skill registry',
    'developer tools',
    'CLI',
    'npm alternative',
    'security scanning',
  ],
  authors: [{ name: 'Tank Team' }],
  creator: 'Tank',
  publisher: 'Tank',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://tankpkg.dev',
    siteName: 'Tank',
    title: 'Tank — Security-first package manager for AI agent skills',
    description: 'Publish, install, and audit AI agent skills with integrity verification and security scanning.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Tank - Security-first package manager for AI agent skills',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tank — Security-first package manager for AI agent skills',
    description: 'Publish, install, and audit AI agent skills with integrity verification and security scanning.',
    images: ['/og-image.png'],
    creator: '@tankpkg',
  },
  alternates: {
    canonical: 'https://tankpkg.dev',
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  category: 'technology',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>{children}</body>
    </html>
  );
}
