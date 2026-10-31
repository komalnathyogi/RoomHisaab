// ⭐ Client-side image compression — bill photo <300KB, WebP me.
// Server pe upload karne se pehle hi chhota kar dete hain = data + storage bachta hai.
export interface CompressOpts { maxKB?: number; maxDim?: number; quality?: number }

export async function compressImage(file: File, opts: CompressOpts = {}): Promise<{ dataUrl: string; kb: number } | null> {
  const { maxKB = 300, maxDim = 1280, quality = 0.78 } = opts
  try {
    const bmp = await createImageBitmap(file).catch(() => null)
    const img = bmp ?? (await loadViaURL(file))
    const w = 'width' in img ? img.width : 0
    const h = 'height' in img ? img.height : 0
    if (!w || !h) return null
    const scale = Math.min(1, maxDim / Math.max(w, h))
    const cw = Math.round(w * scale)
    const ch = Math.round(h * scale)

    let q = quality
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = cw; canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img as CanvasImageSource, 0, 0, cw, ch)
      const dataUrl = canvas.toDataURL('image/webp', q)
      const kb = Math.round(((dataUrl.length - 'data:image/webp;base64,'.length) * 3) / 4 / 1024)
      if (kb <= maxKB) return { dataUrl, kb }
      q = Math.max(0.35, q - 0.15)          // size zyada hai → quality ghatao
    }
    // last resort: dimensions bhi chhote karo
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(cw * 0.6); canvas.height = Math.round(ch * 0.6)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/webp', 0.5)
    const kb = Math.round(((dataUrl.length - 23) * 3) / 4 / 1024)
    return { dataUrl, kb }
  } catch (err) {
    console.error('[image] compress fail', err)
    return null
  }
}

function loadViaURL(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}
