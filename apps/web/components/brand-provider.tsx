'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { getBrandConfig, getBrandCssVars } from '@/lib/branding';
import type { BrandConfig } from '@tank/shared';

interface BrandContextValue {
  brand: BrandConfig;
  isDarkMode: boolean;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function useBrand(): BrandContextValue {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
}

interface BrandProviderProps {
  children: ReactNode;
  initialDarkMode?: boolean;
}

export function BrandProvider({ children, initialDarkMode = false }: BrandProviderProps) {
  const brand = getBrandConfig();

  // Apply brand colors as CSS custom properties
  useEffect(() => {
    const root = document.documentElement;

    // Apply light mode colors
    const lightVars = getBrandCssVars(false);
    Object.entries(lightVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Apply dark mode colors
    const darkVars = getBrandCssVars(true);
    Object.entries(darkVars).forEach(([key, value]) => {
      // Create dark mode versions with -dark suffix
      root.style.setProperty(`${key}-dark`, value);
    });
  }, []);

  return (
    <BrandContext.Provider value={{ brand, isDarkMode: initialDarkMode }}>
      {children}
    </BrandContext.Provider>
  );
}

/**
 * Apply brand colors to CSS custom properties
 * Call this in server components to set initial brand colors
 */
export function getBrandStyle(darkMode = false): Record<string, string> {
  return getBrandCssVars(darkMode);
}
