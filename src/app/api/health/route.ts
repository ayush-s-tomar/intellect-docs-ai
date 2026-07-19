import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from('documents')
      .select('id')
      .limit(1)

    if (error) throw error

    return NextResponse.json({
      status: 'ok',
      checkedAt: new Date().toISOString(),
    })
  } catch (err: unknown) {
    console.error('❌ HEALTH CHECK ERROR:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { status: 'error', message },
      { status: 500 }
    )
  }
}