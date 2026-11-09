import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://intellect-docs-ai.vercel.app";
const TITLE = "AskMyDocs: AI Document Q&A with Cited Answers";
const DESCRIPTION =
  "Upload a document and ask questions in plain English. Every answer cites the exact chunks it came from, with real cosine similarity. Hybrid search (pgvector + full-text, RRF), built-in eval, no signup.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | AskMyDocs",
  },
  description: DESCRIPTION,
  applicationName: "AskMyDocs",
  keywords: [
    "RAG",
    "document Q&A",
    "chat with PDF",
    "hybrid search",
    "pgvector",
    "reciprocal rank fusion",
    "Next.js",
    "Supabase",
    "Groq",
    "AI document assistant",
    "cited answers",
  ],
  authors: [{ name: "Ayush Singh Tomar", url: "https://ayush-s-tomar.vercel.app" }],
  creator: "Ayush Singh Tomar",
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "AskMyDocs",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  colorScheme: "dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AskMyDocs",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: {
    "@type": "Person",
    name: "Ayush Singh Tomar",
    url: "https://ayush-s-tomar.vercel.app",
  },
  codeRepository: "https://github.com/ayush-s-tomar/intellect-docs-ai",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}