import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('documents')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json(data || [])
}

export async function DELETE(req: Request) {
  const { id } = await req.json()
  await supabaseAdmin.from('documents').delete().eq('id', id)
  return NextResponse.json({ success: true })
}