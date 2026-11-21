// Edge Function: foto struk (base64) -> JSON terstruktur via Gemini, dengan retry + fallback model.
// Key hanya ada di server (Supabase Secrets). GEMINI_MODEL (opsional) dicoba paling dulu.
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const N = (nullable=true) => ({type:'INTEGER', nullable})
const schema = {type:'OBJECT', required:['items','costs','grand_total_uncertain'], properties:{
  merchant:{type:'STRING', nullable:true},
  receipt_date:{type:'STRING', nullable:true}, receipt_time:{type:'STRING', nullable:true},
  items:{type:'ARRAY', items:{type:'OBJECT', required:['name','qty','total','uncertain'], properties:{
    name:{type:'STRING'}, qty:{type:'INTEGER'}, unit_price:N(), total:N(), uncertain:{type:'BOOLEAN'}}}},
  subtotal:N(),
  costs:{type:'ARRAY', items:{type:'OBJECT', required:['kind','name','uncertain'], properties:{
    kind:{type:'STRING', enum:['tax','service','discount','other']}, name:{type:'STRING'},
    percent:{type:'NUMBER', nullable:true}, amount:N(), uncertain:{type:'BOOLEAN'}}}},
  grand_total:N(), grand_total_uncertain:{type:'BOOLEAN'}}}
const PROMPT = `Baca struk ini dan kembalikan JSON sesuai skema.
Aturan: semua nominal rupiah bilangan bulat tanpa titik/koma (Rp15.000 -> 15000; titik adalah pemisah ribuan).
total item = harga baris untuk seluruh kuantitas. kind: tax (PPN/pajak/PB1), service, discount (nominal POSITIF), other (kemasan, biaya layanan, dll).
percent hanya jika persentase tercetak; amount hanya jika nominal tercetak.
receipt_date: tanggal transaksi format DD-MM-YYYY (contoh 20-11-2026). receipt_time: waktu transaksi format HH:mm 24 jam (contoh 10:38).
Pakai tanggal/waktu transaksi (Date/Time/Tgl/Jam); jika hanya waktu cetak yang tercantum, pakai itu. Jika tidak tercantum atau tidak terbaca jelas, WAJIB isi null, jangan mengarang.
JANGAN mengarang angka. Jika tidak terbaca yakin, isi null dan set uncertain=true (grand_total_uncertain untuk total akhir).`

// Urutan model: GEMINI_MODEL (env, jika ada) -> daftar berikut (nilai kosong dan duplikat disaring).
// 404 (model tidak ada) dan 429 (kuota habis) langsung pindah model tanpa retry; 500/503 dicoba ulang maks 1x.
const DEFAULT_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-flash-latest']
const RETRYABLE = [500, 503]       // satu-satunya status yang dicoba ulang di model yang sama
const MAX_RETRY = 1                 // percobaan ulang per model (jeda ~1 dtk)
const PER_CALL_MS = 20_000          // batas waktu satu panggilan ke Gemini
const DEADLINE_MS = 65_000          // batas total, jauh di bawah batas sumber daya platform (546)

const VERSION = '2026-11-21e'   // tampil di "Detail teknis" agar jelas versi mana yang ter-deploy
const json = (b:unknown, status=200) => new Response(JSON.stringify(b), {status, headers:{...cors,'content-type':'application/json','x-ocr-version':VERSION}})
type Attempt = {model:string; status:number; note:string}
const fail = (status:number, code:string, error:string, detail?:string, attempts?:Attempt[]) => json({v:VERSION, code, error, detail, attempts}, status)
const sleep = (ms:number) => new Promise(r => setTimeout(r, ms))
const b64 = (u:Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const errText = async (r:Response) => { const t = await r.text(); try { return JSON.parse(t).error?.message ?? t } catch { return t } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors})
  const t0 = Date.now(), attempts:Attempt[] = []
  try {
    let image_base64:string|undefined, mime = 'image/jpeg'
    if ((req.headers.get('content-type') ?? '').includes('application/json')) ({image_base64, mime = 'image/jpeg'} = await req.json().catch(() => ({})))
    else { const u = new Uint8Array(await req.arrayBuffer()); if (u.length) image_base64 = b64(u) }   // foto dikirim biner (lebih hemat memori)
    if (!image_base64) return fail(400, 'BAD_REQUEST', 'Foto tidak terkirim ke server.')
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return fail(500, 'NO_KEY', 'GEMINI_API_KEY belum diset di Supabase Secrets.')
    const chain = [...new Set([Deno.env.get('GEMINI_MODEL')?.trim(), ...DEFAULT_CHAIN].filter(Boolean) as string[])]
    const body = JSON.stringify({contents:[{parts:[{text:PROMPT},{inline_data:{mime_type:mime||'image/jpeg',data:image_base64}}]}],
      generationConfig:{temperature:0, responseMimeType:'application/json', responseSchema:schema}})

    outer: for (const model of chain) {
      for (let n = 0; n <= MAX_RETRY; n++) {
        const left = DEADLINE_MS - (Date.now() - t0)
        if (left < 3_000) break outer                     // sisa waktu terlalu sedikit untuk satu panggilan lagi
        let r:Response
        try {
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {method:'POST', headers:{'content-type':'application/json','x-goog-api-key':key}, body,
              signal:AbortSignal.timeout(Math.min(PER_CALL_MS, left))})
        } catch (e) {
          const timedOut = (e as Error).name === 'TimeoutError'
          attempts.push({model, status:0, note: timedOut ? 'timeout: Gemini terlalu lama merespons' : 'jaringan: ' + (e as Error).message})
          if (timedOut) continue outer
          if (n < MAX_RETRY) await sleep(1000 * (n + 1)); continue
        }
        if (r.ok) {
          const j = await r.json(); let data:any = null
          try { data = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text) } catch { /* ditangani di bawah */ }
          if (data?.items) return json(data)
          attempts.push({model, status:200, note: j.promptFeedback?.blockReason ? 'diblokir: ' + j.promptFeedback.blockReason : 'respons kosong atau bukan JSON valid'})
          continue outer                                  // model ini tidak menghasilkan data: coba model berikutnya
        }
        const note = (await errText(r)).slice(0, 220); attempts.push({model, status:r.status, note})
        if (r.status === 404 || r.status === 429) continue outer   // model tidak ada / kuota habis: langsung model berikutnya
        if (RETRYABLE.includes(r.status)) { if (n < MAX_RETRY) await sleep(1000 * (n + 1) + Math.random() * 400); continue }
        if (r.status === 401 || r.status === 403) return fail(502, 'AUTH_KEY', 'API key Gemini ditolak. Periksa GEMINI_API_KEY di Supabase Secrets.', note, attempts)
        return fail(502, 'BAD_REQUEST', 'Gemini menolak permintaan (foto atau format tidak valid).', note, attempts)
      }
    }
    const busy = attempts.some(a => a.status === 503 || a.note.startsWith('timeout'))
    const quota = attempts.some(a => a.status === 429)
    const gone = attempts.length > 0 && attempts.every(a => a.status === 404)
    if (busy) return fail(503, 'MODEL_BUSY', 'Server Gemini sedang sibuk. Tunggu beberapa detik lalu coba lagi.', undefined, attempts)
    if (quota) return fail(429, 'QUOTA', 'Kuota Gemini habis untuk model yang dicoba. Tunggu beberapa saat atau periksa kuota API key.', undefined, attempts)
    if (gone) return fail(502, 'MODEL_UNAVAILABLE', 'Model Gemini tidak tersedia untuk akun ini. Ubah GEMINI_MODEL di Supabase Secrets.', undefined, attempts)
    return fail(502, 'UNKNOWN', 'Struk belum berhasil dibaca. Coba lagi atau isi manual.', undefined, attempts)
  } catch (e) { return fail(500, 'INTERNAL', 'Terjadi kesalahan di server.', String((e as Error).message ?? e), attempts) }
})
