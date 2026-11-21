import {useCallback,useEffect,useMemo,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {compute,payStatus} from '../lib/calc'
import {rp,wib,txDate} from '../lib/format'
import {confirmDelete,deleteTransaction} from '../lib/tx'
const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 w-full min-w-0'
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
  const res = useMemo(() => d && compute(d.pa.map((p:any)=>p.id),
    d.it.map((i:any)=>({id:i.id,name:i.name,total:Number(i.total_price)})),
    d.as.map((a:any)=>({itemId:a.item_id,pid:a.participant_id,qty:a.qty})),
    d.co.map((c:any)=>({id:c.id,kind:c.kind,name:c.name,percent:c.percent==null?null:Number(c.percent),amount:c.printed_amount==null?null:Number(c.printed_amount),method:c.method})),
    d.tx.receipt_total==null ? null : Number(d.tx.receipt_total)), [d])
  if (gone) return <p className="p-6" role="alert">Transaksi tidak ditemukan. <Link className="underline" to="/">Kembali</Link></p>
  if (!d || !res) return <p className="p-6">Memuat…</p>
  const name = (x:string) => d.pa.find((p:any)=>p.id===x)?.name ?? ''
  const paidOf = (x:string) => d.py.filter((p:any)=>p.participant_id===x).reduce((s:number,p:any)=>s+Number(p.amount),0)
  const rows = res.persons.map(p => ({...p, paid:paidOf(p.pid), ...payStatus(p.total, paidOf(p.pid))}))
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
  return <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
    <Link to="/" className="text-sm text-brand underline">← Semua transaksi</Link>
    <header><h1 className="text-2xl font-extrabold tracking-tight break-words">{d.tx.merchant || 'Tanpa nama tempat'}</h1>
      <p className="text-sm text-slate-500">{txDate(d.tx.transacted_at, d.tx.time_known !== false)}{d.tx.time_known === false && ' · waktu tidak tercantum di struk'}</p></header>
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[['Total tagihan',res.grand],['Sudah dibayar',rows.reduce((s,r)=>s+r.paid,0)],['Sisa',rows.reduce((s,r)=>s+r.sisa,0)],['Kelebihan bayar',rows.reduce((s,r)=>s+r.lebih,0)]]
        .map(([l,v]) => <div key={l as string} className="rounded-xl bg-white border border-slate-200 p-3"><p className="text-xs text-slate-500">{l}</p><p className="font-extrabold tabular-nums break-words">{rp(v as number)}</p></div>)}</section>
    {res.reconDiff!==null && res.reconDiff!==0 && <p className="text-red-700 text-sm" role="status">Selisih dengan total struk: {rp(res.reconDiff)}.</p>}
    {img && <details className={card}><summary className="cursor-pointer font-bold">Foto struk</summary><img src={img} alt="Foto struk" className="mt-3 mx-auto max-h-[28rem] max-w-full"/></details>}
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <section className="space-y-3"><h2 className="font-bold">Tagihan per orang</h2>
        {rows.map(r => <div key={r.pid} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold truncate min-w-0">{name(r.pid)}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE[r.status]}`}>{r.status}</span></div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-slate-500">Tagihan</dt><dd className="font-bold tabular-nums break-words">{rp(r.total)}</dd></div>
            <div><dt className="text-slate-500">Dibayar</dt><dd className="font-bold tabular-nums break-words">{rp(r.paid)}</dd></div>
            <div><dt className="text-slate-500">{r.lebih>0?'Kelebihan':'Sisa'}</dt><dd className="font-bold tabular-nums break-words">{rp(r.lebih>0?r.lebih:r.sisa)}</dd></div></dl>
          <details className="text-sm"><summary className="cursor-pointer text-brand">Lihat rumus</summary>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between gap-3"><span>Subtotal menu</span><span className="tabular-nums">{rp(r.subtotal)}</span></div>
              {d.co.map((c:any) => <div key={c.id} className="flex justify-between gap-3 text-slate-600">
                <span className="min-w-0">{c.kind==='discount'?'−':'+'} {c.name} ({c.percent!=null&&c.printed_amount==null?`${Number(c.percent)}% `:''}{c.method==='equal'?'dibagi rata':'proporsional subtotal'})</span>
                <span className="tabular-nums shrink-0">{rp(r.parts[c.id]??0)}</span></div>)}</div></details></div>)}</section>
      <section className="space-y-3"><h2 className="font-bold">Pembayaran</h2>
        <div className={card}>
          <select className={inp} value={pid} onChange={e=>setPid(e.target.value)} aria-label="Peserta">
            <option value="">Pilih peserta</option>{d.pa.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <div className="grid gap-2 sm:grid-cols-2"><input className={inp} inputMode="numeric" placeholder="Nominal dibayar" value={amt} onChange={e=>setAmt(e.target.value)}/>
            <input className={inp} placeholder="Catatan (opsional)" value={note} onChange={e=>setNote(e.target.value)}/></div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={addPay} className="flex-1 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3 disabled:opacity-60">Catat pembayaran</button>
            {cur && cur.sisa>0 && <button onClick={()=>setAmt(String(cur.sisa))} className="rounded-xl border border-brand text-brand font-bold px-4 py-3">Isi sisa {rp(cur.sisa)}</button>}</div>
          {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}</div>
        {d.py.length===0 ? <p className="text-sm text-slate-500">Belum ada pembayaran tercatat.</p>
          : <ul className="divide-y divide-slate-200 rounded-xl bg-white border border-slate-200">
            {d.py.map((p:any) => <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0"><p className="font-semibold truncate">{name(p.participant_id)}</p><p className="text-slate-500 break-words">{wib(p.paid_at)}{p.note?` · ${p.note}`:''}</p></div>
              <div className="flex items-center gap-2 shrink-0"><span className="font-bold tabular-nums">{rp(Number(p.amount))}</span>
                <button aria-label="Hapus pembayaran" onClick={()=>delPay(p.id)} className="px-2 py-1 text-slate-500">×</button></div></li>)}</ul>}</section></div>
    <div className="space-y-2 border-t border-slate-200 pt-5">
      <button onClick={removeTx} disabled={deleting} className="w-full sm:w-auto rounded-xl border border-red-300 px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">{deleting ? 'Menghapus…' : 'Hapus transaksi'}</button>
      {delErr && <p role="alert" className="text-sm text-red-700">{delErr}</p>}</div>
  </main>
}
