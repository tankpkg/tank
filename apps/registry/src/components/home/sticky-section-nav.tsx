import { useEffect, useState } from 'react';

interface Section {
  id: string;
  label: string;
}

const SECTIONS: Section[] = [
  { id: 'built-with', label: 'In Production' },
  { id: 'why-tank', label: 'Why Tank' },
  { id: 'vault', label: 'Vault' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'atoms', label: 'Atoms' },
  { id: 'comparison-table', label: 'Compare' },
  { id: 'features', label: 'Features' },
  { id: 'faq', label: 'FAQ' }
];

export function StickySectionNav() {
  const [visible, setVisible] = useState(false);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  useEffect(() => {
    const heroEl = document.querySelector('[aria-label="Hero"]');
    if (!heroEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(heroEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const sectionEls = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-10% 0px -80% 0px' }
    );

    for (const el of sectionEls) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [visible]);

  return (
    <nav
      data-testid="sticky-section-nav"
      aria-hidden={!visible}
      style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
      className={`fixed left-0 right-0 top-14 z-[60] border-b border-border bg-background/95 backdrop-blur-lg transition-opacity duration-200 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-label="Page sections">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto py-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap ${
                activeSection === section.id
                  ? 'bg-tank/10 text-tank'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {section.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
