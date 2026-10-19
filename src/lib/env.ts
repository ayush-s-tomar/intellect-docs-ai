import { z } from 'zod'

// The browser never talks to Supabase directly: every read and write goes
// through API routes using the service-role key, so no anon key is needed.
// NEXT_PUBLIC_SUPABASE_URL keeps its name only because it already exists in
// deployed environments; it is a URL, not a secret.
const envSchema = z.object({
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required — get one at console.groq.com'),
  COHERE_API_KEY: z.string().min(1, 'COHERE_API_KEY is required — get one at dashboard.cohere.com'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
})

type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `❌ Invalid environment configuration:\n${issues}\n\nCheck your .env.local file (or Vercel project settings) against README.md's setup section.`
    )
  }
  return parsed.data
}

export const env = loadEnv()