import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description:
      "Gestão da academia — balcão, treinos, presença, cobrança e catraca.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND.colors.background,
    theme_color: BRAND.colors.red,
    orientation: "portrait-primary",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      {
        src: BRAND.logoPath,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.logoPath,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
