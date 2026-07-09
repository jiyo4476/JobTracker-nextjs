import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!(await requireApiKey(req, { allowSameOrigin: false }))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
