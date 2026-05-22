import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

type VersatilLogoProps = {
  height?: number;
  className?: string;
  href?: string;
  priority?: boolean;
};

export function VersatilLogo({
  height = 52,
  className = "",
  href,
  priority = false,
}: VersatilLogoProps) {
  const width = Math.round(height * 2.4);
  const img = (
    <Image
      src={BRAND.logoPath}
      alt={BRAND.name}
      width={width}
      height={height}
      className={`h-auto w-auto object-contain ${className}`}
      style={{ maxHeight: height }}
      priority={priority}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-block shrink-0">
        {img}
      </Link>
    );
  }

  return <span className="inline-block shrink-0">{img}</span>;
}
