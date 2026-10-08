export async function prepareUpload(file: File): Promise<File> {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("That file is too heavy. Try a smaller one.");
  }
  if (!file.type.startsWith("image/") || file.type === "image/gif" || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    bitmap.close?.();
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadMedia(file: File): Promise<{ id: string; kind: string; mime: string }> {
  const prepared = await prepareUpload(file);
  const form = new FormData();
  form.append("file", prepared);
  const response = await fetch("/api/media", { method: "POST", body: form, credentials: "same-origin" });
  const data = (await response.json()) as {
    media?: { id: string; kind: string; mime: string };
    error?: { message?: string };
  };
  if (!response.ok || !data.media) {
    throw new Error(data.error?.message ?? "That file could not be kept.");
  }
  return data.media;
}
