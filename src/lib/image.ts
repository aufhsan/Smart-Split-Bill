import imageCompression from 'browser-image-compression'
/** Kompres di browser sebelum upload: maks ~0,8 MB, sisi terpanjang 1800 px, JPEG. */
export const compressImage = (f:File) =>
  imageCompression(f, {maxSizeMB:0.8, maxWidthOrHeight:1800, useWebWorker:true, fileType:'image/jpeg', initialQuality:0.85})
export const toBase64 = (f:Blob) => new Promise<string>((ok,no) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(r.error); r.readAsDataURL(f) })
