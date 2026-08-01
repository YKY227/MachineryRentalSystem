export const EQUIPMENT_IMAGES_BUCKET_DEFAULT = 'equipment-images';
export const MAX_EQUIPMENT_IMAGES = 10;
export const MAX_EQUIPMENT_IMAGE_BYTES = 8 * 1024 * 1024;

export const EQUIPMENT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type EquipmentImageMimeType = (typeof EQUIPMENT_IMAGE_MIME_TYPES)[number];

export type EquipmentImageDraft = {
  url: string;
  publicUrl?: string;
  storagePath?: string;
  originalPublicUrl?: string;
  originalStoragePath?: string;
  originalIsPersisted?: boolean;
  isNewUpload?: boolean;
  isPersisted?: boolean;
};

export type EquipmentImageUrlChange = {
  draft: EquipmentImageDraft;
  replacedPersistedImage?: EquipmentImageDraft;
  replacedNewUpload?: EquipmentImageDraft;
  restoredPersistedImage?: EquipmentImageDraft;
};

const EQUIPMENT_IMAGE_PATH_PATTERN =
  /^equipment\/[a-z0-9-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export function normalizeEquipmentImageUrls(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const imageUrls: string[] = [];
  for (const item of value) {
    const url = typeof item === 'string' ? item.trim() : '';
    const key = url.toLowerCase();
    if (!url || seen.has(key)) continue;
    seen.add(key);
    imageUrls.push(url);
  }

  if (imageUrls.length > MAX_EQUIPMENT_IMAGES) {
    throw new Error(`imageUrls can contain at most ${MAX_EQUIPMENT_IMAGES} images`);
  }

  return imageUrls;
}

function originalManagedImage(image: EquipmentImageDraft) {
  const publicUrl = image.originalPublicUrl ?? image.publicUrl;
  const storagePath = image.originalStoragePath ?? image.storagePath;
  if (!publicUrl || !storagePath) return undefined;

  return {
    ...image,
    url: publicUrl,
    publicUrl,
    storagePath,
    originalPublicUrl: publicUrl,
    originalStoragePath: storagePath,
    isPersisted: Boolean(image.originalIsPersisted),
  } satisfies EquipmentImageDraft;
}

export function changeEquipmentImageDraftUrl(
  image: EquipmentImageDraft,
  nextUrl: string
): EquipmentImageUrlChange {
  const originalImage = originalManagedImage(image);
  const nextStoragePath = getEquipmentImageStoragePathFromPublicUrl(nextUrl);
  const isOriginalUrl = Boolean(
    originalImage &&
      (nextUrl.trim() === originalImage.publicUrl ||
        nextStoragePath === originalImage.storagePath)
  );

  if (image.isPersisted && originalImage && !isOriginalUrl) {
    return {
      draft: {
        ...image,
        url: nextUrl,
        publicUrl: undefined,
        storagePath: undefined,
        isPersisted: false,
      },
      replacedPersistedImage: originalImage,
    };
  }

  if (
    !image.isPersisted &&
    image.originalIsPersisted &&
    originalImage &&
    isOriginalUrl
  ) {
    return {
      draft: {
        ...image,
        url: nextUrl,
        publicUrl: originalImage.publicUrl,
        storagePath: originalImage.storagePath,
        isPersisted: true,
      },
      restoredPersistedImage: originalImage,
    };
  }

  const isNewUploadBeingReplaced = Boolean(
    image.isNewUpload && image.storagePath && !isOriginalUrl
  );
  return {
    draft: isNewUploadBeingReplaced
      ? {
          ...image,
          url: nextUrl,
          publicUrl: undefined,
          storagePath: undefined,
          isNewUpload: false,
          isPersisted: false,
        }
      : { ...image, url: nextUrl },
    ...(isNewUploadBeingReplaced ? { replacedNewUpload: image } : {}),
  };
}

export function getUnreferencedEquipmentImages(
  images: EquipmentImageDraft[],
  savedImageUrls: Iterable<string> | null | undefined
) {
  if (!savedImageUrls) return [];
  const savedUrls = new Set(Array.from(savedImageUrls, (url) => url.trim()));
  const uniqueImages = new Map<string, EquipmentImageDraft>();

  for (const image of images) {
    if (!image.storagePath) continue;
    uniqueImages.set(image.storagePath, image);
  }

  return Array.from(uniqueImages.values()).filter(
    (image) => !savedUrls.has((image.publicUrl ?? image.url).trim())
  );
}

export function isCurrentEquipmentImageEditorSession(
  currentSessionId: number,
  capturedSessionId: number
) {
  return currentSessionId === capturedSessionId;
}

export function shouldDiscardCompletedEquipmentUpload(
  currentSessionId: number,
  capturedSessionId: number
) {
  return !isCurrentEquipmentImageEditorSession(currentSessionId, capturedSessionId);
}

export function isEquipmentImageStoragePath(value: string | null | undefined) {
  return Boolean(value && EQUIPMENT_IMAGE_PATH_PATTERN.test(value));
}

export function getEquipmentImageStoragePathFromPublicUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const marker = '/storage/v1/object/public/';
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return undefined;

    const bucketAndPath = pathname.slice(markerIndex + marker.length).split('/');
    bucketAndPath.shift();
    const path = decodeURIComponent(bucketAndPath.join('/'));
    return isEquipmentImageStoragePath(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

export function isEquipmentImageMimeType(value: string): value is EquipmentImageMimeType {
  return EQUIPMENT_IMAGE_MIME_TYPES.includes(value as EquipmentImageMimeType);
}

export function getEquipmentImageValidationError(file: Pick<File, 'size' | 'type'>) {
  if (!isEquipmentImageMimeType(file.type)) {
    return 'Only JPEG, PNG, and WebP images are allowed.';
  }
  if (file.size <= 0) return 'The selected image is empty.';
  if (file.size > MAX_EQUIPMENT_IMAGE_BYTES) {
    return 'Each equipment image must be 8 MB or smaller.';
  }
  return null;
}

export function equipmentImageExtension(type: EquipmentImageMimeType) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  return 'webp';
}

export function hasExpectedEquipmentImageSignature(
  bytes: Uint8Array,
  type: EquipmentImageMimeType
) {
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}
