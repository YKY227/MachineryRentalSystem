export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  // Normalize to an ArrayBuffer-backed view for TS BufferSource compatibility.
  const normalized = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", normalized);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
