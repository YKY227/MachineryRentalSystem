import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from '@/lib/auth/admin';
import {
  getEquipmentCataloguePdfValidationError,
  hasExpectedEquipmentCataloguePdfSignature,
  isEquipmentCatalogueStoragePath,
} from '@/lib/rental/equipment/catalogue-pdfs';
import { supabaseAdmin, supabaseBucket } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'A catalogue PDF is required.' }, { status: 400 });
    }

    const validationError = getEquipmentCataloguePdfValidationError(file);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedEquipmentCataloguePdfSignature(bytes)) {
      return NextResponse.json({ error: 'The file contents do not match a PDF document.' }, { status: 400 });
    }

    const requestedKey = String(formData.get('equipmentKey') ?? '');
    const equipmentKey = sanitizePathSegment(requestedKey) || `draft-${randomUUID()}`;
    const path = `equipment-catalogues/${equipmentKey}/${randomUUID()}.pdf`;
    const fileName = file.name.trim().slice(0, 180) || 'catalogue.pdf';
    const supabase = supabaseAdmin();
    const bucket = supabaseBucket();
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) throw new Error(`Catalogue upload failed: ${uploadError.message}`);

    return NextResponse.json({ path, fileName }, { status: 201 });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Catalogue upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as { path?: unknown };
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    if (!isEquipmentCatalogueStoragePath(path)) {
      return NextResponse.json({ error: 'Invalid equipment catalogue storage path.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin().storage.from(supabaseBucket()).remove([path]);
    if (error) throw new Error(`Catalogue deletion failed: ${error.message}`);
    return NextResponse.json({ path });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Catalogue deletion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
