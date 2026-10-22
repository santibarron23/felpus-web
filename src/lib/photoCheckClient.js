// Lado del navegador de /api/photo-check (ver photoCheck.js). Nunca tira:
// ante cualquier problema devuelve null y la foto se sube igual, sin aviso.
export async function checkPhotoKind(dataUrl) {
  try {
    const res = await fetch("/api/photo-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.dudosa === "boolean" ? { dudosa: data.dudosa, tipo: data.tipo || null } : null;
  } catch {
    return null;
  }
}
