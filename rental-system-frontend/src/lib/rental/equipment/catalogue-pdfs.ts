export const MAX_EQUIPMENT_CATALOGUE_PDF_BYTES = 20 * 1024 * 1024;

const PDF_MIME_TYPE = 'application/pdf';
const PDF_SIGNATURE = new TextEncoder().encode('%PDF-');

export function getEquipmentCataloguePdfValidationError(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (file.size <= 0) return 'Catalogue PDF is empty.';
  if (file.size > MAX_EQUIPMENT_CATALOGUE_PDF_BYTES) {
    return 'Catalogue PDF must be 20 MB or smaller.';
  }
  if (file.type !== PDF_MIME_TYPE || !file.name.toLowerCase().endsWith('.pdf')) {
    return 'Catalogue upload must be a PDF file.';
  }
  return null;
}

export function hasExpectedEquipmentCataloguePdfSignature(bytes: Uint8Array) {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function isEquipmentCatalogueStoragePath(value: string) {
  return /^equipment-catalogues\/[a-z0-9-]{1,100}\/[0-9a-f-]{36}\.pdf$/i.test(value);
}

export type EquipmentCatalogueSource = 'uploaded_pdf' | 'manual_url' | 'none';

export function resolveEquipmentCatalogueSource(
  storagePath: string | null | undefined,
  manualUrl: string | null | undefined
): EquipmentCatalogueSource {
  if (storagePath && isEquipmentCatalogueStoragePath(storagePath)) return 'uploaded_pdf';
  if (manualUrl?.trim()) return 'manual_url';
  return 'none';
}

export function catalogueFileNameFromPath(path: string) {
  return path.split('/').pop() || 'catalogue.pdf';
}
