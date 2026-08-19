import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://instructlint.vercel.app",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://instructlint.vercel.app/policies",
      lastModified: new Date("2026-08-20"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
