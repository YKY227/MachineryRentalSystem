import { NextResponse } from 'next/server';

import { isEquipmentCatalogueStoragePath } from '@/lib/rental/equipment/catalogue-pdfs';
import { dbRentalEquipmentRepo } from '@/lib/rental/equipment/db-rental-equipment-repo';
import { supabaseAdmin, supabaseBucket } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const equipment = await dbRentalEquipmentRepo.getPublicByIdOrSlug(params.id);
    const path = equipment?.catalogueStoragePath;
    if (!equipment || !path || !isEquipmentCatalogueStoragePath(path)) {
      return NextResponse.json({ error: 'Catalogue PDF is unavailable.' }, { status: 404 });
    }

    const fileName = equipment.catalogueFileName || 'catalogue.pdf';
    const storage = supabaseAdmin().storage.from(supabaseBucket());
    const [{ data: previewData, error: previewError }, { data: downloadData, error: downloadError }] =
      await Promise.all([
        storage.createSignedUrl(path, 10 * 60),
        storage.createSignedUrl(path, 10 * 60, { download: fileName }),
      ]);
    if (previewError || !previewData?.signedUrl || downloadError || !downloadData?.signedUrl) {
      throw new Error(previewError?.message || downloadError?.message || 'Catalogue preview URL could not be generated.');
    }

    return NextResponse.json({ signedUrl: previewData.signedUrl, downloadUrl: downloadData.signedUrl, fileName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Catalogue preview failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
