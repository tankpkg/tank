'use client';

import {
  BookOpenIcon,
  CloudIcon,
  FileTextIcon,
  MenuIcon,
  PackageSearchIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  TrendingUpIcon,
  WrenchIcon,
  XIcon
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

interface DropdownItem {
  icon: React.ReactNode;
  text: string;
  description: string;
  href: string;
}

interface NavItem {
  href?: string;
  text: string;
  items?: DropdownItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    text: 'Browse Skills',
    items: [
      {
        icon: <PackageSearchIcon style={{ width: '16px', height: '16px' }} />,
        text: 'All Skills',
        description: 'Browse the full registry',
        href: '/skills'
      },
      {
        icon: <TrendingUpIcon style={{ width: '16px', height: '16px' }} />,
        text: 'Most Popular',
        description: 'Top downloaded skills',
        href: '/skills?sort=downloads'
      },
      {
        icon: <SparklesIcon style={{ width: '16px', height: '16px' }} />,
        text: 'Recently Updated',
        description: 'Fresh and maintained',
        href: '/skills?sort=updated'
      },
      {
        icon: <ShieldCheckIcon style={{ width: '16px', height: '16px' }} />,
        text: 'Highest Rated',
        description: 'Best security scores',
        href: '/skills?sort=score'
      }
    ]
  },
  {
    text: 'Docs',
    items: [
      {
        icon: <RocketIcon style={{ width: '16px', height: '16px' }} />,
        text: 'Getting Started',
        description: 'Set up Tank in 2 minutes',
        href: '/docs/getting-started'
      },
      {
        icon: <BookOpenIcon style={{ width: '16px', height: '16px' }} />,
        text: 'Publishing Guide',
        description: 'Share your first skill',
        href: '/docs/publish-first-skill'
      },
      {
        icon: <TerminalIcon style={{ width: '16px', height: '16px' }} />,
        text: 'CLI Reference',
        description: 'All commands documented',
        href: '/docs/cli'
      },
      {
        icon: <FileTextIcon style={{ width: '16px', height: '16px' }} />,
        text: 'API Reference',
        description: 'REST API for integrations',
        href: '/docs/api'
      },
      {
        icon: <WrenchIcon style={{ width: '16px', height: '16px' }} />,
        text: 'MCP Server',
        description: 'Editor integration',
        href: '/docs/mcp'
      },
      {
        icon: <CloudIcon style={{ width: '16px', height: '16px' }} />,
        text: 'CI/CD',
        description: 'Automate publishing',
        href: '/docs/cicd'
      },
      {
        icon: <ServerIcon style={{ width: '16px', height: '16px' }} />,
        text: 'Self-Hosting',
        description: 'Run your own registry',
        href: '/docs/self-hosting'
      }
    ]
  }
];

function NavDropdownItem({ icon, text, description, href }: DropdownItem) {
  return (
    <li>
      <Link
        href={href}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          overflow: 'hidden',
          borderRadius: '8px',
          padding: '10px'
        }}
        className="transition-colors hover:bg-accent">
        <div
          style={{
            display: 'flex',
            width: '36px',
            height: '36px',
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px'
          }}
          className="border border-border bg-muted/50 text-muted-foreground">
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }} className="text-foreground">
            {text}
          </span>
          <span style={{ display: 'block', fontSize: '12px' }} className="text-muted-foreground">
            {description}
          </span>
        </div>
      </Link>
    </li>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '10px', height: '6px', opacity: 0.6 }}
      aria-hidden="true">
      <title>Toggle dropdown</title>
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Navbar() {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobileSection, setMobileSection] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenMenu(text);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpenMenu(null), 150);
  };

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const toggleMobileSection = (text: string) => {
    setMobileSection((prev) => (prev === text ? null : text));
  };

  return (
    <>
      <nav className="hidden lg:block">
        <ul style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {NAV_ITEMS.map((item) => {
            if (item.href && !item.items) {
              return (
                <li key={item.text}>
                  <Link
                    href={item.href}
                    style={{ display: 'block', borderRadius: '6px', padding: '8px 12px', fontSize: '14px' }}
                    className="text-muted-foreground transition-colors hover:text-foreground">
                    {item.text}
                  </Link>
                </li>
              );
            }

            const isOpen = openMenu === item.text;

            return (
              <li
                key={item.text}
                style={{ position: 'relative', perspective: '2000px' }}
                onMouseEnter={() => handleMouseEnter(item.text)}
                onMouseLeave={handleMouseLeave}>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                  className="text-muted-foreground transition-colors hover:text-foreground">
                  {item.text}
                  {item.items && <ChevronIcon />}
                </button>

                {item.items && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '-12px',
                      top: '100%',
                      zIndex: 50,
                      width: '280px',
                      paddingTop: '8px',
                      transformOrigin: 'top left',
                      transition: 'opacity 200ms ease, transform 200ms ease',
                      opacity: isOpen ? 1 : 0,
                      pointerEvents: isOpen ? 'auto' : 'none',
                      transform: isOpen ? 'rotateX(0deg) scale(1)' : 'rotateX(-15deg) scale(0.95)'
                    }}>
                    <ul
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        borderRadius: '12px',
                        padding: '8px'
                      }}
                      className="border border-border bg-popover shadow-lg">
                      {item.items.map((dropdownItem) => (
                        <NavDropdownItem key={dropdownItem.href} {...dropdownItem} />
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
        style={{
          padding: '6px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}>
        {mobileOpen ? (
          <XIcon style={{ width: '20px', height: '20px' }} />
        ) : (
          <MenuIcon style={{ width: '20px', height: '20px' }} />
        )}
      </button>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="lg:hidden"
            style={{
              position: 'fixed',
              inset: 0,
              top: '4rem',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              zIndex: 40,
              border: 'none',
              cursor: 'default'
            }}
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div
            className="lg:hidden border-b border-border bg-background/95 backdrop-blur-xl"
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: '4rem',
              zIndex: 50,
              maxHeight: 'calc(100vh - 4rem)',
              overflowY: 'auto'
            }}>
            <nav style={{ padding: '4px 16px 16px' }}>
              {NAV_ITEMS.map((item) => (
                <div key={item.text}>
                  {item.items ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleMobileSection(item.text)}
                        style={{
                          display: 'flex',
                          width: '100%',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 0',
                          fontSize: '14px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'inherit'
                        }}
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        {item.text}
                        <svg
                          width="10"
                          height="6"
                          viewBox="0 0 10 6"
                          fill="none"
                          style={{
                            width: '10px',
                            height: '6px',
                            opacity: 0.6,
                            transform: mobileSection === item.text ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 200ms ease'
                          }}
                          aria-hidden="true">
                          <path
                            d="M1 1L5 5L9 1"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {mobileSection === item.text && (
                        <ul style={{ paddingBottom: '8px', paddingLeft: '4px' }}>
                          {item.items.map((sub) => (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                onClick={() => setMobileOpen(false)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  borderRadius: '6px',
                                  padding: '8px 10px',
                                  fontSize: '14px'
                                }}
                                className="text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                                {sub.icon}
                                <span>{sub.text}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href!}
                      onClick={() => setMobileOpen(false)}
                      style={{
                        display: 'block',
                        padding: '10px 0',
                        fontSize: '14px'
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      {item.text}
                    </Link>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
