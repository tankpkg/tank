import './globals.css';

import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';

import { CommandMenu } from '@/components/command-menu';
import { CookieConsentManager } from '@/components/cookie-consent-manager';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a2e' }
  ]
};

export const metadata: Metadata = {
  metadataBase: new URL('https://tankpkg.dev'),
  title: {
    default: 'Tank — Security-first package manager for AI agent skills',
    template: '%s | Tank'
  },
  description:
    'Publish, install, and audit AI agent skills with integrity verification, permission budgets, and 6-stage security scanning. The npm for AI skills.',
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
    'security scanning'
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
      'max-snippet': -1
    }
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
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Tank - Security-first package manager for AI agent skills'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tank — Security-first package manager for AI agent skills',
    description: 'Publish, install, and audit AI agent skills with integrity verification and security scanning.',
    images: ['/opengraph-image'],
    creator: '@tankpkg'
  },
  alternates: {
    canonical: 'https://tankpkg.dev'
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'
  },
  manifest: '/site.webmanifest',
  category: 'technology'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
gtag('js',new Date());
gtag('config','${process.env.NEXT_PUBLIC_GA_ID}',{send_page_view:false});`}
            </Script>
          </>
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <RootProvider search={{ enabled: false }}>
          {children}
          <CommandMenu />
        </RootProvider>
        <CookieConsentManager />
      </body>
    </html>
  );
}
