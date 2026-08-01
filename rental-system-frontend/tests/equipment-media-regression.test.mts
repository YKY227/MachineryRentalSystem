import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEquipmentPatchBody } from '../src/lib/rental/equipment/equipment-patch.ts';
import { buildRentalEquipmentPayload } from '../src/lib/rental/equipment/equipment-payload.ts';
import {
  changeEquipmentImageDraftUrl,
  getEquipmentImageValidationError,
  getUnreferencedEquipmentImages,
  hasExpectedEquipmentImageSignature,
  isCurrentEquipmentImageEditorSession,
  MAX_EQUIPMENT_IMAGE_BYTES,
  normalizeEquipmentImageUrls,
  shouldDiscardCompletedEquipmentUpload,
} from '../src/lib/rental/equipment/equipment-images.ts';
import {
  getHttpResourceUrlError,
  toSafeHttpResourceUrl,
} from '../src/lib/rental/equipment/resource-urls.ts';
import {
  getEquipmentCataloguePdfValidationError,
  hasExpectedEquipmentCataloguePdfSignature,
  isEquipmentCatalogueStoragePath,
} from '../src/lib/rental/equipment/catalogue-pdfs.ts';

test('publish-only PATCH does not emit unrelated equipment fields', () => {
  const patch = normalizeEquipmentPatchBody({ isPublished: true });
  assert.deepEqual(patch, { isPublished: true });

  const payload = buildRentalEquipmentPayload(patch, '2026-08-01T00:00:00.000Z');
  assert.deepEqual(payload, {
    updated_at: '2026-08-01T00:00:00.000Z',
    is_published: true,
  });
});

test('sale metadata is presence-aware for PATCH payloads', () => {
  const publishOnlyPayload = buildRentalEquipmentPayload(
    normalizeEquipmentPatchBody({ isPublished: true }),
    '2026-08-01T00:00:00.000Z'
  );
  assert.equal('sale_enabled' in publishOnlyPayload, false);
  assert.equal('sale_status' in publishOnlyPayload, false);
  assert.equal('sale_price_cents' in publishOnlyPayload, false);

  const salePayload = buildRentalEquipmentPayload(
    normalizeEquipmentPatchBody({
      saleEnabled: true,
      saleStatus: 'available_for_sale',
      salePriceMode: 'fixed',
      salePriceCents: 2500000,
      saleFulfillmentModes: ['deliver', 'self_collect'],
    }),
    '2026-08-01T00:00:00.000Z'
  );
  assert.equal(salePayload.sale_enabled, true);
  assert.equal(salePayload.sale_status, 'available_for_sale');
  assert.equal(salePayload.sale_price_mode, 'fixed');
  assert.equal(salePayload.sale_price_cents, 2500000);
  assert.deepEqual(salePayload.sale_fulfillment_modes, ['deliver', 'self_collect']);
});

test('explicit optional-field clears remain database null writes', () => {
  const patch = normalizeEquipmentPatchBody({
    brand: '',
    model: null,
    catalogueUrl: '',
    trainingVideoUrl: null,
    weekRate: null,
    monthRate: null,
  });

  const payload = buildRentalEquipmentPayload(patch, '2026-08-01T00:00:00.000Z');
  assert.equal(payload.brand, null);
  assert.equal(payload.model, null);
  assert.equal(payload.catalogue_url, null);
  assert.equal(payload.training_video_url, null);
  assert.equal(payload.week_rate, null);
  assert.equal(payload.month_rate, null);
});

test('ordered image URLs are preserved and first image mirrors to legacy image_url', () => {
  const imageUrls = [
    'https://example.com/one.jpg',
    'https://example.com/two.jpg',
    'https://example.com/three.jpg',
    'https://example.com/four.jpg',
    'https://example.com/five.jpg',
  ];
  const payload = buildRentalEquipmentPayload(
    { imageUrls },
    '2026-08-01T00:00:00.000Z'
  );

  assert.deepEqual(payload.image_urls, imageUrls);
  assert.equal(payload.image_url, imageUrls[0]);
});

test('equipment image count is capped during create and PATCH normalization', () => {
  const imageUrls = Array.from(
    { length: 11 },
    (_, index) => `https://example.com/equipment-${index + 1}.jpg`
  );

  assert.throws(() => normalizeEquipmentImageUrls(imageUrls), /at most 10 images/);
  assert.throws(
    () => buildRentalEquipmentPayload({ imageUrls }),
    /at most 10 images/
  );
  assert.throws(
    () => normalizeEquipmentPatchBody({ imageUrls }),
    /at most 10 images/
  );

  const tenImageUrls = imageUrls.slice(0, 10);
  assert.deepEqual(
    normalizeEquipmentPatchBody({ imageUrls: tenImageUrls }).imageUrls,
    tenImageUrls
  );
});

test('removed persisted uploads are cleaned only when their saved URL is absent', () => {
  const persistedImage = {
    url: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/lift/11111111-1111-1111-1111-111111111111.jpg',
    publicUrl: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/lift/11111111-1111-1111-1111-111111111111.jpg',
    storagePath: 'equipment/lift/11111111-1111-1111-1111-111111111111.jpg',
    isPersisted: true,
  };

  assert.deepEqual(
    getUnreferencedEquipmentImages([persistedImage], []),
    [persistedImage]
  );
  assert.deepEqual(getUnreferencedEquipmentImages([persistedImage], undefined), []);
  assert.deepEqual(
    getUnreferencedEquipmentImages(
      [persistedImage, persistedImage],
      [persistedImage.publicUrl]
    ),
    []
  );
});

test('replacing a persisted managed image queues its original object for post-save cleanup', () => {
  const persistedImage = {
    url: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/lift/22222222-2222-2222-2222-222222222222.jpg',
    publicUrl: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/lift/22222222-2222-2222-2222-222222222222.jpg',
    storagePath: 'equipment/lift/22222222-2222-2222-2222-222222222222.jpg',
    originalPublicUrl: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/lift/22222222-2222-2222-2222-222222222222.jpg',
    originalStoragePath: 'equipment/lift/22222222-2222-2222-2222-222222222222.jpg',
    originalIsPersisted: true,
    isPersisted: true,
  };
  const manualUrl = 'https://images.example.com/replacement.jpg';
  const replacement = changeEquipmentImageDraftUrl(persistedImage, manualUrl);

  assert.equal(replacement.draft.url, manualUrl);
  assert.equal(replacement.draft.storagePath, undefined);
  assert.equal(replacement.draft.isPersisted, false);
  assert.deepEqual(replacement.replacedPersistedImage?.storagePath, persistedImage.storagePath);
  assert.deepEqual(
    getUnreferencedEquipmentImages(
      replacement.replacedPersistedImage ? [replacement.replacedPersistedImage] : [],
      []
    ),
    [replacement.replacedPersistedImage]
  );
  assert.deepEqual(
    getUnreferencedEquipmentImages(
      replacement.replacedPersistedImage ? [replacement.replacedPersistedImage] : [],
      undefined
    ),
    []
  );

  const restored = changeEquipmentImageDraftUrl(replacement.draft, persistedImage.url);
  assert.equal(restored.draft.storagePath, persistedImage.storagePath);
  assert.equal(restored.draft.isPersisted, true);
  assert.equal(restored.restoredPersistedImage?.storagePath, persistedImage.storagePath);
});

test('manual URL edits do not queue Storage cleanup, while replaced new uploads are cleaned', () => {
  const manual = changeEquipmentImageDraftUrl(
    { url: 'https://images.example.com/one.jpg' },
    'https://images.example.com/two.jpg'
  );
  assert.equal(manual.replacedPersistedImage, undefined);
  assert.equal(manual.replacedNewUpload, undefined);

  const newUpload = changeEquipmentImageDraftUrl(
    {
      url: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/draft/33333333-3333-3333-3333-333333333333.jpg',
      publicUrl: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/draft/33333333-3333-3333-3333-333333333333.jpg',
      storagePath: 'equipment/draft/33333333-3333-3333-3333-333333333333.jpg',
      originalPublicUrl: 'https://example.supabase.co/storage/v1/object/public/equipment-images/equipment/draft/33333333-3333-3333-3333-333333333333.jpg',
      originalStoragePath: 'equipment/draft/33333333-3333-3333-3333-333333333333.jpg',
      originalIsPersisted: false,
      isNewUpload: true,
    },
    'https://images.example.com/manual.jpg'
  );
  assert.equal(newUpload.replacedNewUpload?.storagePath, 'equipment/draft/33333333-3333-3333-3333-333333333333.jpg');
  assert.equal(newUpload.draft.storagePath, undefined);
});

test('stale upload completions are rejected for a newer editor session', () => {
  assert.equal(isCurrentEquipmentImageEditorSession(8, 8), true);
  assert.equal(isCurrentEquipmentImageEditorSession(9, 8), false);
  assert.equal(shouldDiscardCompletedEquipmentUpload(9, 8), true);
});

test('resource URLs accept HTTP(S), including normal YouTube watch links', () => {
  const youtubeUrl = 'https://www.youtube.com/watch?v=a4HGk5NSqHg';
  assert.equal(getHttpResourceUrlError(youtubeUrl, 'Training video URL'), null);
  assert.equal(toSafeHttpResourceUrl(youtubeUrl), youtubeUrl);
  assert.match(
    getHttpResourceUrlError('javascript:alert(1)', 'Catalogue URL') ?? '',
    /http:\/\//
  );
  assert.equal(toSafeHttpResourceUrl('javascript:alert(1)'), '');
  assert.throws(
    () => normalizeEquipmentPatchBody({ catalogueUrl: 'ftp://example.com/catalogue.pdf' }),
    /http:\/\//
  );
});

test('equipment upload validation rejects unsupported, oversized, and spoofed files', () => {
  assert.match(
    getEquipmentImageValidationError({ type: 'application/pdf', size: 100 }) ?? '',
    /JPEG/
  );
  assert.match(
    getEquipmentImageValidationError({
      type: 'image/png',
      size: MAX_EQUIPMENT_IMAGE_BYTES + 1,
    }) ?? '',
    /8 MB/
  );
  assert.equal(
    hasExpectedEquipmentImageSignature(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      'image/jpeg'
    ),
    false
  );
  assert.equal(
    hasExpectedEquipmentImageSignature(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      'image/jpeg'
    ),
    true
  );
});

test('catalogue uploads require a bounded PDF and use a scoped storage path', () => {
  assert.equal(
    getEquipmentCataloguePdfValidationError({ name: 'catalogue.pdf', type: 'application/pdf', size: 1024 }),
    null
  );
  assert.match(
    getEquipmentCataloguePdfValidationError({ name: 'catalogue.docx', type: 'application/pdf', size: 1024 }) ?? '',
    /PDF/
  );
  assert.match(
    getEquipmentCataloguePdfValidationError({ name: 'catalogue.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }) ?? '',
    /20 MB/
  );
  assert.equal(hasExpectedEquipmentCataloguePdfSignature(new TextEncoder().encode('%PDF-1.7')), true);
  assert.equal(hasExpectedEquipmentCataloguePdfSignature(new TextEncoder().encode('not a PDF')), false);
  assert.equal(
    isEquipmentCatalogueStoragePath('equipment-catalogues/scissor-lift/11111111-1111-1111-1111-111111111111.pdf'),
    true
  );
  assert.equal(isEquipmentCatalogueStoragePath('invoices/secret.pdf'), false);
});
