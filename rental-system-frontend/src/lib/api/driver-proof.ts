import { USE_BACKEND } from "@/lib/config";
import { getDriverToken } from "@/lib/driver-auth";

export type ProofPhotoDto = {
  id: string;
  jobId: string;
  stopId?: string | null;
  url: string;
  takenAt: string;
};

/**
 * Upload proof photo for a job stop.
 * - Uses backend proxy (/api/backend)
 * - Attaches Authorization header
 * - Normalizes relative /uploads URLs
 */
export async function uploadProofPhoto(
  jobId: string,
  file: File,
  stopId?: string
): Promise<ProofPhotoDto> {
  if (!USE_BACKEND) {
    throw new Error("Backend is disabled; cannot upload proof photo.");
  }

  const token = getDriverToken();
  if (!token) {
    throw new Error("Missing driver token. Please log in again.");
  }

  const formData = new FormData();
  formData.append("file", file);
  if (stopId) formData.append("stopId", stopId);

  const res = await fetch(`/api/backend/driver/jobs/${jobId}/proof`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // ❌ DO NOT set Content-Type for FormData
    },
    body: formData,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to upload proof photo: ${res.status} ${res.statusText} ${text}`
    );
  }

  const data = (await res.json()) as ProofPhotoDto;

  return {
    ...data,
    url: resolveFileUrl(data.url),
  };
}

/**
 * Convert backend-relative file paths to frontend-accessible URLs
 * Example:
 *   /uploads/proof-photos/abc.jpg
 * → /api/backend/uploads/proof-photos/abc.jpg
 */
function resolveFileUrl(url: string): string {
  if (!url) return url;

  // absolute
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (u.pathname.startsWith("/uploads/")) {
        return `/api/backend${u.pathname}`; // keep it behind proxy
      }
      return url;
    } catch {
      return url;
    }
  }

  // normalize missing leading slash
  const normalized = url.startsWith("uploads/") ? `/${url}` : url;

  if (normalized.startsWith("/uploads/")) {
    return `/api/backend${normalized}`;
  }

  return normalized;
}


