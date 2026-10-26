import { api } from "./api";
import { tr } from "./i18n";

export type Photo = { id: string; alt: string; type: string; bytes: number; source: string; created_at: number; used: boolean };

// Photos are made smaller in the browser before they go up: 1600 px wide is enough for a page.
export async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bmp.width);
  const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: "image/webp", quality: 0.82 });
}

export async function uploadPhoto(siteId: number, file: File) {
  const res = await fetch(`/api/sites/${siteId}/photos`, { method: "POST", headers: { "content-type": "image/webp" }, body: await shrink(file) });
  const out = (await res.json()) as { id?: string; photos?: Photo[]; error?: string };
  if (!out.id) throw new Error(tr(out.error ?? "The photo didn't upload."));
  return out as { id: string; photos: Photo[] };
}

export const listPhotos = (siteId: number) => api<Photo[]>(`/api/sites/${siteId}/photos`);
