/** Converts SVG pages to vector PDF and PNG. The heavy libraries load only when used. */

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Size in mm read from the page's viewBox. */
function pageSizeOf(svg: string): { w: number; h: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 420, h: 297 }
}

/** Vector PDF with one sheet per SVG page. The embedded DejaVu font covers Ø, ₂, → and accented letters. */
export async function svgPagesToPdf(svgs: string[]): Promise<Uint8Array> {
  const [{ jsPDF }, { svg2pdf }, sansUrl, boldUrl] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js'),
    import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url').then((m) => m.default),
    import('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url').then((m) => m.default),
  ])
  const [sans, bold] = await Promise.all([fetch(sansUrl).then((r) => r.arrayBuffer()), fetch(boldUrl).then((r) => r.arrayBuffer())])
  const first = pageSizeOf(svgs[0])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [first.w, first.h], compress: true })
  pdf.addFileToVFS('DejaVuSans.ttf', toBase64(sans))
  pdf.addFileToVFS('DejaVuSans-Bold.ttf', toBase64(bold))
  // registered as "Arial": it is the font-family our SVGs use
  pdf.addFont('DejaVuSans.ttf', 'Arial', 'normal')
  pdf.addFont('DejaVuSans-Bold.ttf', 'Arial', 'bold')

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden'
  document.body.appendChild(host)
  try {
    for (let i = 0; i < svgs.length; i++) {
      const { w, h } = pageSizeOf(svgs[i])
      if (i > 0) pdf.addPage([w, h], 'landscape')
      host.innerHTML = svgs[i]
      await svg2pdf(host.firstElementChild as SVGElement, pdf, { x: 0, y: 0, width: w, height: h })
    }
  } finally {
    host.remove()
  }
  return new Uint8Array(pdf.output('arraybuffer'))
}

/** PNG at `dpi` dots per inch (300 = print quality). */
export async function svgToPng(svg: string, dpi = 200): Promise<Uint8Array> {
  const { w, h } = pageSizeOf(svg)
  const px = (mm: number) => Math.round((mm / 25.4) * dpi)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = px(w)
    canvas.height = px(h)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Could not create the PNG')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}
