import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

type VersatilLogoProps = {
  height?: number;
  className?: string;
  href?: string;
  priority?: boolean;
};

/** Wordmark vetorial oficial da Versátil Academia. */
export function VersatilLogo({
  height = 52,
  className = "",
  href,
  priority = false,
}: VersatilLogoProps) {
  const width = Math.round(height * (640 / 180));

  const mark = (
    <Image
      src={BRAND.logoPath}
      alt={BRAND.name}
      width={width}
      height={height}
      priority={priority}
      // SVG não passa pelo otimizador do Next (responde 400); serve o arquivo estático.
      unoptimized
      // O SVG não declara width/height: sem tamanho explícito o navegador o desenha 0×0.
      className={`object-contain object-left ${className}`}
      style={{ width, height }}
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
