import { z } from 'zod'

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty'),
})

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required'),
  selectedDocIds: z.array(z.union([z.string(), z.number()]).transform(val => String(val))).default([]),
  session_id: z.string().min(1, 'session_id is required'),
})

export const evalRequestSchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
  document_id: z.union([z.string(), z.number()]).transform(val => String(val)),
})

export const documentsDeleteSchema = z.object({
  id: z.string().min(1, 'Document id is required'),
})

export const documentsQuerySchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
})

export const uploadFieldsSchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
})

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ')
}