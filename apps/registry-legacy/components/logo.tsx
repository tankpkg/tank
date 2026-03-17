import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  tight?: boolean;
  className?: string;
}

export function Logo({ tight = false, className = '' }: LogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src={tight ? '/icon.svg' : '/logo.svg'}
        alt="Tank logo"
        width={tight ? 32 : 120}
        height={tight ? 32 : 40}
        className={className}
        priority
      />
      <span className="text-sm font-semibold">Tank</span>
    </Link>
  );
}
