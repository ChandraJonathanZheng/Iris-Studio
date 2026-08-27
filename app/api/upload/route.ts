import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

const ALLOWED_BUCKETS = ['homework-audio', 'homework-photos'] as const

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file')
  const bucket = formData.get('bucket')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (typeof bucket !== 'string' || !ALLOWED_BUCKETS.includes(bucket as (typeof ALLOWED_BUCKETS)[number])) {
    return NextResponse.json({ error: 'invalid bucket' }, { status: 400 })
  }

  const db = supabaseServer()
  const path = `${Date.now()}-${file.name}`
  const { error } = await db.storage.from(bucket).upload(path, file)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data } = db.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
