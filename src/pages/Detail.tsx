import {useCallback,useEffect,useMemo,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {compute,payStatus} from '../lib/calc'
type Computed = ReturnType<typeof compute>
type PersonRow = Computed['persons'][number] & ReturnType<typeof payStatus> & {paid:number}
import {rp,wib,txDate} from '../lib/format'
import {confirmDelete,deleteTransaction} from '../lib/tx'
const inp = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base'   // text-base (16px) mencegah auto-zoom di HP
const back = 'inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline'

const card = 'rounded-xl bg-white border border-slate-200 p-4 space-y-3'
const BADGE:Record<string,string> = {'Belum Bayar':'bg-red-100 text-red-800','Dibayar Sebagian':'bg-amber-100 text-amber-900','Lunas':'bg-emerald-100 text-emerald-900'}
export default function Detail() {
  const {id} = useParams()
  const nav = useNavigate(), [deleting,setDeleting] = useState(false), [delErr,setDelErr] = useState(''), [gone,setGone] = useState(false)
  const [d,setD] = useState<any>(null), [err,setErr] = useState('')
  const [pid,setPid] = useState(''), [amt,setAmt] = useState(''), [note,setNote] = useState(''), [busy,setBusy] = useState(false)
  const load = useCallback(async () => {
    const q = (t:string) => supabase.from(t).select('*').eq('transaction_id', id!)
    const [tx,pa,it,as,co,py] = await Promise.all([supabase.from('transactions').select('*').eq('id',id!).single(),
      q('participants').order('position'), q('items'), q('item_assignments'), q('additional_costs'), q('payments').order('paid_at',{ascending:false})])
    if (tx.error) return setGone(true)
    setD({tx:tx.data, pa:pa.data??[], it:it.data??[], as:as.data??[], co:co.data??[], py:py.data??[]})
  }, [id])
  useEffect(() => { load() }, [load])
  const [img,setImg] = useState('')
  useEffect(() => { supabase.from('receipts').select('storage_path').eq('transaction_id',id!).limit(1).then(async ({data}) => {
    const p = data?.[0]?.storage_path; if (p) { const s = await supabase.storage.from('receipts').createSignedUrl(p,3600); setImg(s.data?.signedUrl ?? '') } }) }, [id])
  const res = useMemo<Computed|null>(() => d ? compute(d.pa.map((p:any)=>p.id),
    d.it.map((i:any)=>({id:i.id,name:i.name,total:Number(i.total_price)})),
    d.as.map((a:any)=>({itemId:a.item_id,pid:a.participant_id,qty:a.qty})),
    d.co.map((c:any)=>({id:c.id,kind:c.kind,name:c.name,percent:c.percent==null?null:Number(c.percent),amount:c.printed_amount==null?null:Number(c.printed_amount),method:c.method})),
    d.tx.receipt_total==null ? null : Number(d.tx.receipt_total)) : null, [d])
  if (gone) return <p className="p-4 sm:p-6 lg:p-8" role="alert">Transaksi tidak ditemukan. <Link className="underline" to="/">Kembali</Link></p>
  if (!d || !res) return <p className="p-4 sm:p-6 lg:p-8">Memuat…</p>
  const name = (x:string) => d.pa.find((p:any)=>p.id===x)?.name ?? ''
  const paidOf = (x:string) => d.py.filter((p:any)=>p.participant_id===x).reduce((s:number,p:any)=>s+Number(p.amount),0)
  const rows:PersonRow[] = res.persons.map(p => ({...p, paid:paidOf(p.pid), ...payStatus(p.total, paidOf(p.pid))}))
  async function addPay() {
    const amount = Math.round(Number(amt)||0)
    if (!pid || amount<=0) return setErr('Pilih peserta dan isi nominal lebih dari 0.')
    setBusy(true); setErr('')
    const {error} = await supabase.from('payments').insert({transaction_id:id,participant_id:pid,amount,note:note||null})
    if (error) setErr(error.message); else { setAmt(''); setNote(''); await load() }
    setBusy(false)
  }
  async function removeTx() {
    if (deleting || !confirmDelete(d.tx.merchant)) return
    setDeleting(true); setDelErr('')
    try { await deleteTransaction(id!); nav('/', {replace:true}) }
    catch (x:any) { setDelErr(x.message ?? 'Gagal menghapus transaksi.'); setDeleting(false) }
  }
  async function delPay(x:string) { await supabase.from('payments').delete().eq('id',x); load() }
  const cur = rows.find(r=>r.pid===pid)
  const who = (itemId:string):string[] => d.as.filter((a:any)=>a.item_id===itemId).map((a:any)=>`${name(a.participant_id)}${a.qty>1?` ×${a.qty}`:''}`)
  return <main className="min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
    <div className="space-y-1"><Link to="/" className={back}>← Semua transaksi</Link>
      <header className="min-w-0"><h1 className="break-words text-2xl font-extrabold tracking-tight">{d.tx.merchant || 'Tanpa nama tempat'}</h1>
        <p className="text-sm text-slate-500">{txDate(d.tx.transacted_at, d.tx.time_known !== false)}{d.tx.time_known === false && ' · waktu tidak tercantum di struk'}</p></header></div>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[['Total tagihan',res.grand],['Sudah dibayar',rows.reduce((s,r)=>s+r.paid,0)],['Sisa',rows.reduce((s,r)=>s+r.sisa,0)],['Kelebihan bayar',rows.reduce((s,r)=>s+r.lebih,0)]]
        .map(([l,v]) => <div key={l as string} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><p className="truncate text-xs text-slate-500">{l}</p><p className="break-words font-extrabold tabular-nums">{rp(v as number)}</p></div>)}</section>
    {res.reconDiff!==null && res.reconDiff!==0 && <p className="text-sm text-red-700" role="status">Selisih dengan total struk: {rp(res.reconDiff)}.</p>}

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
      {/* Kiri: menu, pajak/service/biaya, foto struk */}
      <div className="min-w-0 space-y-5 lg:col-span-7">
        <section className={card}><h2 className="font-bold">Menu dan pembagiannya</h2>
          {d.it.length===0 ? <p className="text-sm text-slate-500">Tidak ada menu.</p>
            : <ul className="divide-y divide-slate-200">{d.it.map((i:any) => { const w = who(i.id)
              return <li key={i.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0"><p className="truncate font-semibold">{i.name}</p>
                  <p className={`break-words text-xs ${w.length ? 'text-slate-500' : 'text-amber-700'}`}>{w.length ? w.join(', ') : 'Belum dibagikan ke siapa pun'}</p></div>
                <p className="shrink-0 font-bold tabular-nums">{rp(Number(i.total_price))}</p></li> })}</ul>}
          <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-sm font-bold"><span>Subtotal menu</span><span className="tabular-nums">{rp(res.itemsTotal)}</span></div></section>

        {d.co.length>0 && <section className={card}><h2 className="font-bold">Pajak, service, diskon, biaya lain</h2>
          <ul className="divide-y divide-slate-200">{d.co.map((c:any) => { const r = res.costRows.find(x=>x.id===c.id)
            return <li key={c.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0"><p className="truncate font-semibold">{c.name}</p>
                <p className="text-xs text-slate-500">{c.percent!=null&&c.printed_amount==null?`${Number(c.percent)}% · `:''}{c.method==='equal'?'dibagi rata':'proporsional subtotal'}</p></div>
              <p className="shrink-0 font-bold tabular-nums">{c.kind==='discount'?'−':''}{rp(r?.amount ?? 0)}</p></li> })}</ul></section>}

        {img && <details className={card}><summary className="min-h-11 cursor-pointer py-2 font-bold">Foto struk</summary><img src={img} alt="Foto struk" className="mx-auto mt-3 max-h-[28rem] max-w-full"/></details>}
      </div>

      {/* Kanan (desktop): tagihan per orang, pembayaran, aksi; menempel saat scroll */}
      <aside className="min-w-0 space-y-5 lg:sticky lg:top-6 lg:col-span-5 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
        <section className="space-y-3"><h2 className="font-bold">Tagihan per orang</h2>
          {rows.map(r => <div key={r.pid} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 truncate font-bold">{name(r.pid)}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE[r.status]}`}>{r.status}</span></div>
            <dl className="grid grid-cols-3 gap-2 text-sm lg:grid-cols-1 xl:grid-cols-3">
              <div className="min-w-0 lg:flex lg:justify-between lg:gap-3 xl:block"><dt className="text-slate-500">Tagihan</dt><dd className="break-words font-bold tabular-nums">{rp(r.total)}</dd></div>
              <div className="min-w-0 lg:flex lg:justify-between lg:gap-3 xl:block"><dt className="text-slate-500">Dibayar</dt><dd className="break-words font-bold tabular-nums">{rp(r.paid)}</dd></div>
              <div className="min-w-0 lg:flex lg:justify-between lg:gap-3 xl:block"><dt className="text-slate-500">{r.lebih>0?'Kelebihan':'Sisa'}</dt><dd className="break-words font-bold tabular-nums">{rp(r.lebih>0?r.lebih:r.sisa)}</dd></div></dl>
            <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 text-brand">Lihat rumus</summary>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between gap-3"><span>Subtotal menu</span><span className="tabular-nums">{rp(r.subtotal)}</span></div>
                {d.co.map((c:any) => <div key={c.id} className="flex justify-between gap-3 text-slate-600">
                  <span className="min-w-0">{c.kind==='discount'?'−':'+'} {c.name} ({c.percent!=null&&c.printed_amount==null?`${Number(c.percent)}% `:''}{c.method==='equal'?'dibagi rata':'proporsional subtotal'})</span>
                  <span className="shrink-0 tabular-nums">{rp(r.parts[c.id]??0)}</span></div>)}</div></details></div>)}</section>

        <section className="space-y-3"><h2 className="font-bold">Pembayaran</h2>
          <div className={card}>
            <select className={inp} value={pid} onChange={e=>setPid(e.target.value)} aria-label="Peserta">
              <option value="">Pilih peserta</option>{d.pa.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><input className={inp} inputMode="numeric" placeholder="Nominal dibayar" value={amt} onChange={e=>setAmt(e.target.value)}/>
              <input className={inp} placeholder="Catatan (opsional)" value={note} onChange={e=>setNote(e.target.value)}/></div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={addPay} className="min-h-12 flex-1 whitespace-nowrap rounded-xl bg-brand px-4 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60">Catat pembayaran</button>
              {cur && cur.sisa>0 && <button onClick={()=>setAmt(String(cur.sisa))} className="min-h-12 rounded-xl border border-brand px-4 py-3 font-bold text-brand hover:bg-brand/5">Isi sisa {rp(cur.sisa)}</button>}</div>
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}</div>
          {d.py.length===0 ? <p className="text-sm text-slate-500">Belum ada pembayaran tercatat.</p>
            : <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {d.py.map((p:any) => <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0"><p className="truncate font-semibold">{name(p.participant_id)}</p><p className="break-words text-slate-500">{wib(p.paid_at)}{p.note?` · ${p.note}`:''}</p></div>
                <div className="flex shrink-0 items-center gap-1"><span className="font-bold tabular-nums">{rp(Number(p.amount))}</span>
                  <button aria-label="Hapus pembayaran" onClick={()=>delPay(p.id)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div></li>)}</ul>}</section>

        <div className="space-y-2 border-t border-slate-200 pt-5">
          <button onClick={removeTx} disabled={deleting} className="min-h-12 w-full rounded-xl border border-red-300 px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">{deleting ? 'Menghapus…' : 'Hapus transaksi'}</button>
          {delErr && <p role="alert" className="text-sm text-red-700">{delErr}</p>}</div>
      </aside>
    </div>
  </main>
}
