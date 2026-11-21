import {MouseEvent,useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {rp,txDate} from '../lib/format'
import {clearAll} from '../lib/draft'
import {confirmDelete,deleteTransaction} from '../lib/tx'
type Tx = {id:string; merchant:string|null; transacted_at:string; created_at:string; total:number; time_known:boolean}
type Row = Tx & {ts:number; cs:number}
type SortKey = 'terbaru'|'terlama'|'terbesar'|'terkecil'
const SORTS:[SortKey,string][] = [['terbaru','Terbaru'],['terlama','Terlama'],['terbesar','Nominal terbesar'],['terkecil','Nominal terkecil']]
const monthLabel = new Intl.DateTimeFormat('id-ID', {month:'long', year:'numeric', timeZone:'Asia/Jakarta'})
const monthKey = (ms:number) => new Date(ms + 7*3600e3).toISOString().slice(0,7)      // bulan menurut WIB (UTC+7, tanpa DST)
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

export default function Dashboard() {
  const [rows,setRows] = useState<Tx[]|null>(null), [deleting,setDeleting] = useState<string|null>(null), [err,setErr] = useState('')
  const [query,setQuery] = useState(''), [sort,setSort] = useState<SortKey>('terbaru')
  useEffect(() => { supabase.from('transactions').select('id,merchant,transacted_at,created_at,time_known,total')
    .order('transacted_at',{ascending:false}).order('created_at',{ascending:false})       // urutan dasar dari server: terbaru, lalu created_at terbaru
    .then(({data,error}) => { if (error) setErr(error.message); setRows((data as Tx[]) ?? []) }) }, [])

  const groups = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    const list:Row[] = rows.map(t => ({...t, ts:Date.parse(t.transacted_at), cs:Date.parse(t.created_at)}))
      .filter(t => !q || (t.merchant ?? '').toLowerCase().includes(q))
    const byDate = (a:Row, b:Row) => b.ts - a.ts || b.cs - a.cs
    list.sort({terbaru:byDate, terlama:(a:Row,b:Row)=>byDate(b,a),
      terbesar:(a:Row,b:Row)=>b.total-a.total || byDate(a,b), terkecil:(a:Row,b:Row)=>a.total-b.total || byDate(a,b)}[sort])
    const m = new Map<string,{label:string; total:number; items:Row[]}>()
    for (const t of list) {
      const k = monthKey(t.ts), g = m.get(k) ?? {label:monthLabel.format(new Date(t.ts)), total:0, items:[]}
      g.total += Number(t.total); g.items.push(t); m.set(k, g)
    }
    const keys = [...m.keys()].sort(); if (sort !== 'terlama') keys.reverse()           // bulan terbaru dulu, kecuali "Terlama"
    return keys.map(k => m.get(k)!)
  }, [rows, query, sort])

  async function remove(e:MouseEvent, t:Tx) {
    e.preventDefault(); e.stopPropagation()                    // jangan ikut membuka halaman detail
    if (deleting || !confirmDelete(t.merchant)) return
    setDeleting(t.id); setErr('')
    try { await deleteTransaction(t.id); setRows(rs => (rs ?? []).filter(x => x.id !== t.id)) }
    catch (x:any) { setErr(x.message ?? 'Gagal menghapus transaksi.') }
    setDeleting(null)
  }
  return <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
    <header className="flex items-center justify-between">
      <h1 className="text-2xl font-extrabold tracking-tight">Transaksi</h1>
      <button onClick={()=>supabase.auth.signOut()} className="text-sm text-slate-600 underline">Keluar</button></header>
    <div className="grid gap-3 sm:grid-cols-2"><Link to="/scan" onClick={clearAll} className="block text-center rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3">Scan struk</Link><Link to="/baru" onClick={clearAll} className="block text-center rounded-xl border border-brand text-brand font-bold py-3">Isi manual</Link></div>
    {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
    {rows===null ? <p>Memuat…</p> : rows.length===0
      ? <p className="text-slate-600">Belum ada transaksi. Buat yang pertama dan masukkan menu dari struk.</p>
      : <>
        <div className="flex gap-2">
          <input type="search" className={field+' min-w-0 flex-1'} placeholder="Cari nama tempat…" aria-label="Cari nama tempat" value={query} onChange={e=>setQuery(e.target.value)}/>
          <select className={field+' max-w-[9.5rem] shrink-0'} aria-label="Urutkan" value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
            {SORTS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {groups.length===0 && <p className="text-slate-600 text-sm">Tidak ada transaksi yang cocok dengan “{query.trim()}”. <button onClick={()=>setQuery('')} className="underline text-brand">Hapus pencarian</button></p>}
        {groups.map(g => <section key={g.label} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 px-1"><h2 className="text-sm font-bold">{g.label}</h2><p className="text-sm tabular-nums text-slate-500">{rp(g.total)}</p></div>
          <ul className="divide-y divide-slate-200 rounded-xl bg-white border border-slate-200">
            {g.items.map(t => <li key={t.id} className={`flex items-center ${deleting===t.id ? 'opacity-50' : ''}`}>
              <Link to={`/transaksi/${t.id}`} className="flex flex-1 min-w-0 justify-between gap-3 p-4 hover:bg-paper">
                <div className="min-w-0"><p className="font-semibold truncate">{t.merchant || 'Tanpa nama tempat'}</p><p className="text-sm text-slate-500">{txDate(t.transacted_at, t.time_known)}</p></div>
                <p className="font-bold tabular-nums shrink-0">{rp(t.total)}</p></Link>
              <button onClick={e=>remove(e,t)} disabled={!!deleting} aria-label={`Hapus transaksi ${t.merchant || 'tanpa nama tempat'}`} title="Hapus transaksi"
                className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-60">
                {deleting===t.id ? <span className="text-xs">…</span> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>}</button></li>)}</ul></section>)}</>}
  </main>
}
