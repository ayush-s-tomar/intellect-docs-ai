import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Lightweight ping used by a scheduled GitHub Action to keep the
// Supabase free-tier project from auto-pausing due to inactivity.
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
  } catch (err: any) {
    console.error('❌ HEALTH CHECK ERROR:', err)
    return NextResponse.json(
      { status: 'error', message: err.message },
      { status: 500 }
    )
  }
}