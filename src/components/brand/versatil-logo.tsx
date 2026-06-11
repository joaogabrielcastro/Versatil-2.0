import Link from "next/link";
import { BRAND } from "@/lib/brand";

type VersatilLogoProps = {
  height?: number;
  className?: string;
  href?: string;
  priority?: boolean;
};

/** Logo em SVG — não depende de arquivo em public/ para demos. */
export function VersatilLogo({
  height = 52,
  className = "",
  href,
}: VersatilLogoProps) {
  const width = Math.round(height * 2.6);
  const mark = (
    <svg
      width={width}
      height={height}
      viewBox="0 0 260 52"
      role="img"
      aria-label={BRAND.name}
      className={className}
    >
      <rect x="0" y="8" width="36" height="36" rx="6" fill="#c41e3a" />
      <text
        x="18"
        y="32"
        textAnchor="middle"
        fill="#fff"
        fontSize="18"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        V
      </text>
      <text
        x="48"
        y="22"
        fill="#c41e3a"
        fontSize="15"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.04em"
      >
        VERSÁTIL
      </text>
      <text
        x="48"
        y="40"
        fill="#5c5c5c"
        fontSize="11"
        fontWeight="500"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.12em"
      >
        ACADEMIA
      </text>
    </svg>
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
