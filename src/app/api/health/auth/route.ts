import { NextRequest, NextResponse } from 'next/server'
import { requireAuthentication } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!(await requireAuthentication(req, { allowSameOrigin: false }))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
