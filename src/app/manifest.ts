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
        src: BRAND.favicon16,
        sizes: "16x16",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.favicon32,
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.iconMaskable192,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: BRAND.iconMaskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
