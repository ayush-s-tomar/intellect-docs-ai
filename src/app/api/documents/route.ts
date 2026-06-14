import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json([])
  }

  const { data } = await supabaseAdmin
    .from('documents')
    .select('id, name, created_at, summary')   // 👈 added summary here
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const { id } = await req.json()

  await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('session_id', sessionId)

  return NextResponse.json({ success: true })
}