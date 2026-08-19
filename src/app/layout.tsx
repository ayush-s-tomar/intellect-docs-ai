import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "AskMyDocs — AI Document Q&A",
  description: "Upload any document and ask questions about it in natural language. Answers are grounded strictly in your document, with cited sources and similarity scores.",
  openGraph: {
    title: "AskMyDocs — AI Document Q&A",
    description: "Upload any document and ask questions about it in natural language, with cited sources and similarity scores.",
    url: "https://intellect-docs-ai.vercel.app",
    siteName: "AskMyDocs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AskMyDocs — AI Document Q&A",
    description: "Upload any document and ask questions about it in natural language, with cited sources and similarity scores.",
  },
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}