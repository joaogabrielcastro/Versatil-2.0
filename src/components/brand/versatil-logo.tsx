import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

type VersatilLogoProps = {
  height?: number;
  className?: string;
  href?: string;
  priority?: boolean;
};

/** Logo oficial Versátil Academia (`public/versatil-academia-logo.png`). */
export function VersatilLogo({
  height = 52,
  className = "",
  href,
  priority = false,
}: VersatilLogoProps) {
  const width = Math.round(height * 2.85);

  const mark = (
    <Image
      src={BRAND.logoPath}
      alt={BRAND.name}
      width={width}
      height={height}
      priority={priority}
      className={`h-auto w-auto object-contain object-left ${className}`}
      style={{ maxHeight: height }}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-block shrink-0">
        {mark}
      </Link>
    );
  }

  return <span className="inline-block shrink-0">{mark}</span>;
}
