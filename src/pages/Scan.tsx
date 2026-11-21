import {useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {FunctionsFetchError,FunctionsHttpError} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'
import {compressImage,toBase64} from '../lib/image'
import {saveOcr} from '../lib/draft'

type Problem = {msg:string; detail?:string}
/** Ambil isi JSON error asli dari Edge Function (supabase-js hanya memberi pesan generik). */
async function explain(e:unknown): Promise<Problem> {
  if (e instanceof FunctionsHttpError) {
    const b:any = await e.context.json().catch(() => null)
    if (b?.code === 'WORKER_RESOURCE_LIMIT') return {msg:'Server kehabisan waktu atau sumber daya saat membaca struk. Tekan "Baca struk" untuk mencoba lagi.', detail:JSON.stringify(b)}
    if (b?.error) return {msg:b.error, detail:[b.v && `versi fungsi: ${b.v}`, b.code, b.detail, ...(b.attempts ?? []).map((a:any) => `${a.model}: ${a.status} ${a.note}`)].filter(Boolean).join('\n')}
    if (b?.message) return {msg:`Server menolak permintaan: ${b.message}`, detail:JSON.stringify(b)}
    return {msg:`Server mengembalikan status ${e.context.status}.`}
  }
  if (e instanceof FunctionsFetchError) return {msg:'Tidak bisa terhubung ke server. Periksa koneksi internet Anda.'}
  return {msg:(e as Error)?.message ?? 'Terjadi kesalahan.'}
}

export default function Scan() {
  const nav = useNavigate()
  const [file,setFile] = useState<File|null>(null), [preview,setPreview] = useState('')
  const [step,setStep] = useState(''), [err,setErr] = useState<Problem|null>(null), [path,setPath] = useState<string|null>(null)
  function pick(f?:File) { if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)); setErr(null); setPath(null) }
  async function run() {
    if (!file) return; setErr(null)
    try {
      setStep('Mengompres foto…'); const img = await compressImage(file)
      let p = path
      if (!p) {                                     // upload sekali saja; percobaan ulang memakai file yang sama
        setStep('Mengunggah foto…'); const {data:{user}} = await supabase.auth.getUser()
        p = `${user!.id}/${crypto.randomUUID()}.jpg`
        const {error} = await supabase.storage.from('receipts').upload(p, img, {contentType:'image/jpeg'})
        if (error) throw error; setPath(p)
      }
      setStep('Membaca struk dengan AI…')
      const {data,error} = await supabase.functions.invoke('ocr-receipt', {body:{image_base64:await toBase64(img), mime:'image/jpeg'}})
      if (error) throw error
      if (!data?.items) throw new Error('Struk tidak bisa dibaca.')
      saveOcr({receiptPath:p, ocr:data}); nav('/verifikasi')
    } catch (e) { setErr(await explain(e)); setStep('') }
  }
  const btn = 'flex-1 text-center cursor-pointer rounded-xl border border-brand text-brand font-bold py-3'
  return <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
    <Link to="/" className="text-sm text-brand underline">← Kembali</Link>
    <h1 className="text-2xl font-extrabold tracking-tight">Scan struk</h1>
    <div className="flex flex-col sm:flex-row gap-3">
      <label className={btn}>Ambil foto<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e=>pick(e.target.files?.[0])}/></label>
      <label className={btn}>Pilih dari galeri<input type="file" accept="image/*" className="sr-only" onChange={e=>pick(e.target.files?.[0])}/></label></div>
    {preview && <img src={preview} alt="Pratinjau struk" className="max-h-96 w-full object-contain rounded-xl bg-white border border-slate-200"/>}
    {err && <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-red-800 text-sm">{err.msg}</p>
      {err.detail && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Detail teknis</summary><pre className="mt-1 whitespace-pre-wrap break-words">{err.detail}</pre></details>}
      <p className="text-xs text-slate-600">Tekan "Baca struk" untuk mencoba lagi (foto tidak diunggah ulang), atau:</p>
      <button onClick={()=>{saveOcr({receiptPath:path,ocr:null}); nav('/verifikasi')}} className="text-sm underline text-brand">Isi data struk secara manual</button></div>}
    <button disabled={!file||!!step} onClick={run} className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3 disabled:opacity-60">{step || 'Baca struk'}</button>
  </main>
}
