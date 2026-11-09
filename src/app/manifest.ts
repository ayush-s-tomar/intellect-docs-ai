import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AskMyDocs',
    short_name: 'AskMyDocs',
    description: 'Ask questions about your documents and get answers that cite their sources.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#0a0a0f',
    icons: [{ src: '/icon.png', type: 'image/png' }],
  }
}