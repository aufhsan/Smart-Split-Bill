import {useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {loadOcr,saveDraft} from '../lib/draft'
import {alloc} from '../lib/calc'
import type {Kind} from '../lib/calc'
import {rp,receiptDT} from '../lib/format'
const uid = () => crypto.randomUUID()
const num = (v:string) => Math.max(0, Math.round(Number(v)||0))
const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 w-full min-w-0'
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
  if (!o) return <p className="p-6">Belum ada hasil scan. <Link className="underline" to="/scan">Scan struk</Link></p>
  const ok = (id:string, fn:(id:string,p:any)=>void) => <button onClick={()=>fn(id,{})} className="text-xs text-amber-800 underline">Kurang jelas dibaca. Tandai sudah benar</button>
  function next() {
    saveDraft({receiptPath:o!.receiptPath, merchant, date:rdate, time:rtime, receiptTotal:grand?num(grand):null,
      items:rows.map(r=>({id:r.id, name:r.name||'Menu', total:r.total})),
      costs:costs.map(c=>({id:c.id, kind:c.kind, name:c.name, percent:c.percent, amount:c.amount, method:c.kind==='other'?'equal':'proportional'}))})
    nav('/baru')
  }
  return <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-32">
    <Link to="/scan" className="text-sm text-brand underline">← Scan ulang</Link>
    <h1 className="text-2xl font-extrabold tracking-tight">Periksa hasil scan</h1>
    {!x && <p className="text-sm text-slate-600">Struk tidak terbaca otomatis. Isi data di bawah secara manual.</p>}
    <section className={card}><input className={inp} placeholder="Nama tempat (opsional)" value={merchant} onChange={e=>setMerchant(e.target.value)}/>
      <div className="grid grid-cols-2 gap-2"><input className={inp} type="date" aria-label="Tanggal transaksi" value={rdate} onChange={e=>setRdate(e.target.value)}/>
        <input className={inp} type="time" aria-label="Waktu transaksi" value={rtime} onChange={e=>setRtime(e.target.value)}/></div>
      <p className="text-sm">{dt.text && <span className="font-semibold">{dt.text}</span>}{dt.note && <span className="text-slate-500">{dt.text ? ' · ' : ''}{dt.note}</span>}</p></section>
    <section className={card}><h2 className="font-bold">Menu</h2>
      {rows.map(r => <div key={r.id} className="space-y-1"><div className="flex flex-wrap gap-2">
        <input className={inp+' flex-1 basis-44'+warn(r.flag)} value={r.name} onChange={e=>pr(r.id,{name:e.target.value})} placeholder="Nama menu"/>
        <input className={inp+' flex-1 basis-32 sm:flex-none sm:w-40'+warn(r.flag)} inputMode="numeric" value={r.total||''} onChange={e=>pr(r.id,{total:num(e.target.value)})} placeholder="Harga total"/>
        {parseQty(r.name) && <button aria-label={`Pecah menjadi ${parseQty(r.name)!.qty} item satuan`} onClick={()=>split(r.id)} className="rounded-lg border border-brand text-brand text-xs font-bold px-2">Pecah</button>}
        <button aria-label="Hapus menu" onClick={()=>setRows(rows.filter(z=>z.id!==r.id))} className="px-2">×</button></div>
        {r.flag && ok(r.id, pr)}</div>)}
      <button onClick={()=>setRows([...rows,{id:uid(),name:'',total:0,flag:false}])} className="rounded-lg border border-brand text-brand font-bold px-4 py-2">+ Tambah menu</button></section>
    <section className={card}><h2 className="font-bold">Pajak, service, diskon, biaya lain</h2>
      {costs.map(c => <div key={c.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="flex gap-2"><select className={inp+' !w-36 shrink-0'} value={c.kind} onChange={e=>pc(c.id,{kind:e.target.value as Kind})}>
          <option value="tax">Pajak</option><option value="service">Service</option><option value="discount">Diskon</option><option value="other">Lain</option></select>
          <input className={inp+warn(c.flag)} value={c.name} onChange={e=>pc(c.id,{name:e.target.value})}/>
          <button aria-label="Hapus biaya" onClick={()=>setCosts(costs.filter(z=>z.id!==c.id))} className="px-2">×</button></div>
        <div className="grid grid-cols-2 gap-2">
          <input className={inp+warn(c.flag)} inputMode="decimal" placeholder="Persen %" value={c.percent??''} onChange={e=>pc(c.id,{percent:e.target.value===''?null:Number(e.target.value)})}/>
          <input className={inp+warn(c.flag)} inputMode="numeric" placeholder="Nominal" value={c.amount??''} onChange={e=>pc(c.id,{amount:e.target.value===''?null:num(e.target.value)})}/></div>
        {c.flag && ok(c.id, pc)}</div>)}
      <button onClick={()=>setCosts([...costs,{id:uid(),kind:'tax',name:'PPN',percent:null,amount:null,flag:false}])} className="rounded-lg border border-brand text-brand font-bold px-4 py-2">+ Tambah biaya</button></section>
    <section className={card}><h2 className="font-bold">Total di struk</h2>
      <input className={inp+warn(gFlag)} inputMode="numeric" value={grand} onChange={e=>{setGrand(e.target.value); setGFlag(false)}} placeholder="Grand total"/>
      {gFlag && <button onClick={()=>setGFlag(false)} className="text-xs text-amber-800 underline">Kurang jelas dibaca. Tandai sudah benar</button>}
      {x?.subtotal!=null && x.subtotal!==sum && <p className="text-sm text-amber-800">Subtotal struk {rp(x.subtotal)} berbeda dari jumlah menu {rp(sum)}.</p>}
      {grand && <p role="status" className={num(grand)===exp?'text-sm text-brand':'text-sm text-red-700'}>
        {num(grand)===exp ? 'Total cocok dengan struk.' : `Hitungan dari daftar ${rp(exp)} berbeda ${rp(num(grand)-exp)} dari total struk. Periksa harga atau biaya.`}</p>}</section>
    <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><div className="max-w-3xl mx-auto space-y-1">
      {flags>0 && <p className="text-xs text-amber-800">Masih ada {flags} bagian yang kurang jelas. Periksa lalu tandai benar.</p>}
      <button disabled={flags>0||rows.length===0} onClick={next} className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3 disabled:opacity-60">Lanjut ke pembagian</button></div></div>
  </main>
}
