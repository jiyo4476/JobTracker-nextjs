import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/http'

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req, { allowSameOrigin: false })
  if (denied) return denied

  return NextResponse.json({ ok: true })
}
