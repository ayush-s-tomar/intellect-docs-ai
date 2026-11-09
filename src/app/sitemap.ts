import type { MetadataRoute } from 'next'

const SITE_URL = 'https://intellect-docs-ai.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/eval`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/eval/retrieval`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ]
}