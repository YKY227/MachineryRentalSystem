import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import {
  adminUnauthorizedResponse,
  assertAdmin,
  isAdminUnauthorized,
} from '@/lib/auth/admin';
import {
  equipmentImageExtension,
  getEquipmentImageValidationError,
  hasExpectedEquipmentImageSignature,
  isEquipmentImageStoragePath,
  isEquipmentImageMimeType,
} from '@/lib/rental/equipment/equipment-images';
import {
  supabaseAdmin,
  supabaseEquipmentImagesBucket,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function isEquipmentImagePublicUrl(value: unknown, bucket: string, path: string) {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    const publicPrefix = `/storage/v1/object/public/${encodeURIComponent(bucket)}/`;
    if (!url.pathname.startsWith(publicPrefix)) return false;
    const publicPath = decodeURIComponent(url.pathname.slice(publicPrefix.length));
    return publicPath === path;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'An equipment image file is required.' }, { status: 400 });
    }

    const validationError = getEquipmentImageValidationError(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    if (!isEquipmentImageMimeType(file.type)) {
      return NextResponse.json({ error: 'Unsupported equipment image type.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedEquipmentImageSignature(bytes, file.type)) {
      return NextResponse.json(
        { error: 'The file contents do not match its declared image type.' },
        { status: 400 }
      );
    }

    const requestedKey = String(formData.get('equipmentKey') ?? '');
    const equipmentKey = sanitizePathSegment(requestedKey) || `draft-${randomUUID()}`;
    const bucket = supabaseEquipmentImagesBucket();
    const extension = equipmentImageExtension(file.type);
    const path = `equipment/${equipmentKey}/${randomUUID()}.${extension}`;
    const supabase = supabaseAdmin();

    const { data: bucketMetadata, error: bucketError } = await supabase.storage.getBucket(bucket);
    if (bucketError) {
      throw new Error(`Equipment image bucket is unavailable: ${bucketError.message}`);
    }
    if (!bucketMetadata.public) {
      throw new Error('Equipment image bucket must be public before uploads can be enabled.');
    }

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw new Error(`Equipment image upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = publicUrlData.publicUrl?.trim();
    if (!publicUrl) {
      await supabase.storage.from(bucket).remove([path]);
      throw new Error('Equipment image public URL could not be generated.');
    }

    return NextResponse.json({ path, publicUrl }, { status: 201 });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Equipment image upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    assertAdmin(req);
    const body = (await req.json()) as { path?: unknown; publicUrl?: unknown };
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    if (!isEquipmentImageStoragePath(path)) {
      return NextResponse.json({ error: 'Invalid equipment image storage path.' }, { status: 400 });
    }

    const bucket = supabaseEquipmentImagesBucket();
    if (!isEquipmentImagePublicUrl(body.publicUrl, bucket, path)) {
      return NextResponse.json({ error: 'Invalid equipment image public URL.' }, { status: 400 });
    }
    const supabase = supabaseAdmin();
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw new Error(`Equipment image deletion failed: ${error.message}`);

    return NextResponse.json({ path });
  } catch (error) {
    if (isAdminUnauthorized(error)) return adminUnauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Equipment image deletion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
