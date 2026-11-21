import {useEffect,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {loadOcr,saveDraft} from '../lib/draft'
import {alloc} from '../lib/calc'
import type {Kind} from '../lib/calc'
import {rp,receiptDT} from '../lib/format'
const uid = () => crypto.randomUUID()
const num = (v:string) => Math.max(0, Math.round(Number(v)||0))
const inp = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base'   // text-base (16px) mencegah auto-zoom di HP
const back = 'inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline'
const iconBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-100'
const outBtn = 'min-h-11 rounded-lg border border-brand px-4 py-2 font-bold text-brand hover:bg-brand/5'
const nextBtn = 'min-h-12 w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60'
const card = 'rounded-xl bg-white border border-slate-200 p-4 space-y-3'
const warn = (f:boolean) => f ? ' !border-amber-400 !bg-amber-50' : ''
// Awalan jumlah di nama menu: "2x Bakwan", "2 x Bakwan", "2× Bakwan" (qty dari OCR sudah dijadikan awalan "N× " saat dimuat).
const QTY = /^\s*(\d{1,2})\s*[x×X]\s+(.+)$/
const parseQty = (name:string) => { const m = name.match(QTY); return m && Number(m[1]) > 1 ? {qty:Number(m[1]), name:m[2].trim()} : null }
// Tanggal DD-MM-YYYY (atau YYYY-MM-DD) -> yyyy-mm-dd; waktu HH:mm -> HH:mm. Tidak valid -> '' (jangan mengarang).
function parseDate(v:unknown) {
  if (typeof v !== 'string') return ''
  let y = '', m = '', d = '', r = v.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (r) [, d, m, y] = r; else { r = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (r) [, y, m, d] = r; else return '' }
  const t = new Date(Date.UTC(+y, +m-1, +d))
  return t.getUTCFullYear()===+y && t.getUTCMonth()===+m-1 && t.getUTCDate()===+d ? `${y}-${m}-${d}` : ''
}
function parseTime(v:unknown) {
  const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})/) : null
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2,'0')}:${m[2]}` : ''
}
type Row = {id:string; name:string; total:number; flag:boolean}
type CRow = {id:string; kind:Kind; name:string; percent:number|null; amount:number|null; flag:boolean}
export default function Verify() {
  const nav = useNavigate(), [o] = useState(loadOcr), x = o?.ocr
  const [merchant,setMerchant] = useState<string>(x?.merchant ?? '')
  const [rdate,setRdate] = useState(parseDate(x?.receipt_date)), [rtime,setRtime] = useState(parseTime(x?.receipt_time))
  const dt = receiptDT(rdate, rtime)
  const [rows,setRows] = useState<Row[]>((x?.items ?? []).map((i:any) => ({id:uid(), name:(i.qty>1?`${i.qty}× `:'')+i.name, total:i.total ?? 0, flag:!!i.uncertain || i.total==null})))
  const [costs,setCosts] = useState<CRow[]>((x?.costs ?? []).map((c:any) => ({id:uid(), kind:c.kind, name:c.name, percent:c.percent ?? null, amount:c.amount ?? null, flag:!!c.uncertain})))
  const [grand,setGrand] = useState<string>(x?.grand_total!=null ? String(x.grand_total) : ''), [gFlag,setGFlag] = useState(!!x?.grand_total_uncertain)
  const sum = rows.reduce((s,r)=>s+r.total, 0)
  const exp = sum + costs.reduce((s,c) => s + (c.kind==='discount'?-1:1) * (c.amount ?? (c.percent!=null ? Math.round(c.percent*sum/100) : 0)), 0)
  const flags = rows.filter(r=>r.flag).length + costs.filter(c=>c.flag).length + (gFlag?1:0)
  const pr = (id:string, p:Partial<Row>) => setRows(rows.map(r => r.id===id ? {...r, flag:false, ...p} : r))
  const pc = (id:string, p:Partial<CRow>) => setCosts(costs.map(c => c.id===id ? {...c, flag:false, ...p} : c))
  function split(id:string) {                         // pecah "2x Bakwan 5000" menjadi 2 baris satuan; total tetap sama
    const i = rows.findIndex(r => r.id===id), q = i<0 ? null : parseQty(rows[i].name); if (!q) return
    const parts = alloc(rows[i].total, Array(q.qty).fill(1))    // pembulatan: selisih dibagi ke baris awal
    setRows([...rows.slice(0,i), ...parts.map(t => ({id:uid(), name:q.name, total:t, flag:rows[i].flag})), ...rows.slice(i+1)])
  }
  const [img,setImg] = useState('')                 // pratinjau foto struk (signed URL, hanya baca)
  const rp0 = o?.receiptPath
  useEffect(() => { if (!rp0) return; let live = true
    supabase.storage.from('receipts').createSignedUrl(rp0, 3600).then(({data}) => { if (live) setImg(data?.signedUrl ?? '') }).catch(() => {})
    return () => { live = false } }, [rp0])
  if (!o) return <p className="p-4 sm:p-6 lg:p-8">Belum ada hasil scan. <Link className="underline" to="/scan">Scan struk</Link></p>
  const ok = (id:string, fn:(id:string,p:any)=>void) => <button onClick={()=>fn(id,{})} className="min-h-11 text-left text-xs font-semibold text-amber-800 underline">Kurang jelas dibaca. Tandai sudah benar</button>
  function next() {
    saveDraft({receiptPath:o!.receiptPath, merchant, date:rdate, time:rtime, receiptTotal:grand?num(grand):null,
      items:rows.map(r=>({id:r.id, name:r.name||'Menu', total:r.total})),
      costs:costs.map(c=>({id:c.id, kind:c.kind, name:c.name, percent:c.percent, amount:c.amount, method:c.kind==='other'?'equal':'proportional'}))})
    nav('/baru')
  }
  const flagMsg = flags>0 && <p className="text-xs text-amber-800">Masih ada {flags} bagian yang kurang jelas. Periksa lalu tandai benar.</p>
  const photo = img && <img src={img} alt="Foto struk" loading="lazy" className="mx-auto max-h-[28rem] max-w-full rounded-lg object-contain"/>
  return <main className="min-w-0 space-y-5 p-4 pb-48 sm:p-6 sm:pb-32 lg:p-8 lg:pb-8">
    <div className="space-y-1"><Link to="/scan" className={back}>← Scan ulang</Link>
      <h1 className="text-2xl font-extrabold tracking-tight">Periksa hasil scan</h1>
      {!x && <p className="text-sm text-slate-600">Struk tidak terbaca otomatis. Isi data di bawah secara manual.</p>}</div>

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
      <div className="min-w-0 space-y-5 lg:col-span-7">
        {img && <details className={card+' lg:hidden'}><summary className="min-h-11 cursor-pointer py-2 font-bold">Foto struk</summary><div className="mt-3">{photo}</div></details>}
        <section className={card}><h2 className="font-bold">Tempat</h2><input className={inp} placeholder="Nama tempat (opsional)" value={merchant} onChange={e=>setMerchant(e.target.value)}/>
          <div className="grid grid-cols-2 gap-2"><input className={inp} type="date" aria-label="Tanggal transaksi" value={rdate} onChange={e=>setRdate(e.target.value)}/>
            <input className={inp} type="time" aria-label="Waktu transaksi" value={rtime} onChange={e=>setRtime(e.target.value)}/></div>
          <p className="text-sm">{dt.text && <span className="font-semibold">{dt.text}</span>}{dt.note && <span className="text-slate-500">{dt.text ? ' · ' : ''}{dt.note}</span>}</p></section>
        <section className={card}><h2 className="font-bold">Menu</h2>
          {rows.map(r => <div key={r.id} className="space-y-1"><div className="flex flex-wrap gap-2">
            <input className={inp+' flex-1 basis-44'+warn(r.flag)} value={r.name} onChange={e=>pr(r.id,{name:e.target.value})} placeholder="Nama menu"/>
            <input className={inp+' flex-1 basis-32 sm:w-40 sm:flex-none'+warn(r.flag)} inputMode="numeric" value={r.total||''} onChange={e=>pr(r.id,{total:num(e.target.value)})} placeholder="Harga total"/>
            {parseQty(r.name) && <button aria-label={`Pecah menjadi ${parseQty(r.name)!.qty} item satuan`} onClick={()=>split(r.id)} className="min-h-11 rounded-lg border border-brand px-3 text-xs font-bold text-brand">Pecah</button>}
            <button aria-label="Hapus menu" onClick={()=>setRows(rows.filter(z=>z.id!==r.id))} className={iconBtn}>×</button></div>
            {r.flag && ok(r.id, pr)}</div>)}
          <button onClick={()=>setRows([...rows,{id:uid(),name:'',total:0,flag:false}])} className={outBtn}>+ Tambah menu</button></section>
        <section className={card}><h2 className="font-bold">Pajak, service, diskon, biaya lain</h2>
          {costs.map(c => <div key={c.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex gap-2"><select className={inp+' !w-32 shrink-0 sm:!w-36'} value={c.kind} onChange={e=>pc(c.id,{kind:e.target.value as Kind})}>
              <option value="tax">Pajak</option><option value="service">Service</option><option value="discount">Diskon</option><option value="other">Lain</option></select>
              <input className={inp+warn(c.flag)} value={c.name} onChange={e=>pc(c.id,{name:e.target.value})}/>
              <button aria-label="Hapus biaya" onClick={()=>setCosts(costs.filter(z=>z.id!==c.id))} className={iconBtn}>×</button></div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inp+warn(c.flag)} inputMode="decimal" placeholder="Persen %" value={c.percent??''} onChange={e=>pc(c.id,{percent:e.target.value===''?null:Number(e.target.value)})}/>
              <input className={inp+warn(c.flag)} inputMode="numeric" placeholder="Nominal" value={c.amount??''} onChange={e=>pc(c.id,{amount:e.target.value===''?null:num(e.target.value)})}/></div>
            {c.flag && ok(c.id, pc)}</div>)}
          <button onClick={()=>setCosts([...costs,{id:uid(),kind:'tax',name:'PPN',percent:null,amount:null,flag:false}])} className={outBtn}>+ Tambah biaya</button></section>
      </div>

      {/* Kanan (desktop): foto struk berdampingan, pengecekan total, dan tombol lanjut; menempel saat scroll */}
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:col-span-5 lg:flex lg:max-h-[calc(100vh-6.5rem)] lg:flex-col">
        {img && <section className={card+' hidden lg:block lg:min-h-0 lg:overflow-y-auto'}><h2 className="font-bold">Foto struk</h2>{photo}</section>}
        <section className={card+' lg:shrink-0'}><h2 className="font-bold">Total di struk</h2>
          <input className={inp+warn(gFlag)} inputMode="numeric" value={grand} onChange={e=>{setGrand(e.target.value); setGFlag(false)}} placeholder="Grand total"/>
          {gFlag && <button onClick={()=>setGFlag(false)} className="min-h-11 text-left text-xs font-semibold text-amber-800 underline">Kurang jelas dibaca. Tandai sudah benar</button>}
          {x?.subtotal!=null && x.subtotal!==sum && <p className="text-sm text-amber-800">Subtotal struk {rp(x.subtotal)} berbeda dari jumlah menu {rp(sum)}.</p>}
          {grand && <p role="status" className={num(grand)===exp?'text-sm text-brand':'text-sm text-red-700'}>
            {num(grand)===exp ? 'Total cocok dengan struk.' : `Hitungan dari daftar ${rp(exp)} berbeda ${rp(num(grand)-exp)} dari total struk. Periksa harga atau biaya.`}</p>}</section>
        <div className="hidden space-y-1 lg:block lg:shrink-0">{flagMsg}
          <button disabled={flags>0||rows.length===0} onClick={next} className={nextBtn}>Lanjut ke pembagian</button></div>
      </aside>
    </div>

    {/* Mobile: bar di atas bottom nav (h-16 + safe area). Tablet: menempel di dasar layar. Desktop: tombol ada di kolom kanan. */}
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 p-4 md:bottom-0 md:pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"><div className="mx-auto max-w-3xl space-y-1">
      {flagMsg}
      <button disabled={flags>0||rows.length===0} onClick={next} className={nextBtn}>Lanjut ke pembagian</button></div></div>
  </main>
}
