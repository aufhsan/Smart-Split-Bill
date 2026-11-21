import {useEffect,useMemo,useState} from 'react'
import type {CSSProperties,MouseEvent} from 'react'
import {supabase} from '../lib/supabase'
import {rp} from '../lib/format'
import {confirmDelete,deleteTransaction} from '../lib/tx'
import {TX_COLS,errMsg,loadSettlements} from '../lib/settle'
import type {Settle,Tx} from '../lib/settle'
import TxLink from '../components/TxLink'

type Row = Tx & {ts:number; cs:number}
type SortKey = 'terbaru'|'terlama'|'terbesar'|'terkecil'
type Filter = 'semua'|'belum'|'lunas'
const SORTS:[SortKey,string][] = [['terbaru','Terbaru'],['terlama','Terlama'],['terbesar','Nominal terbesar'],['terkecil','Nominal terkecil']]
const FILTERS:[Filter,string][] = [['semua','Semua'],['belum','Belum Lunas'],['lunas','Lunas']]
const monthLabel = new Intl.DateTimeFormat('id-ID', {month:'long', year:'numeric', timeZone:'Asia/Jakarta'})
const monthKey = (ms:number) => new Date(ms + 7*3600e3).toISOString().slice(0,7)      // bulan menurut WIB (UTC+7, tanpa DST)
const field = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base'
// Select dengan panah sendiri: panah bawaan browser menempel di tepi kanan tanpa jarak.
const sel = field + ' appearance-none pr-10'
const chevron: CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem'}

export default function Riwayat() {
  const [rows,setRows] = useState<Tx[]|null>(null), [deleting,setDeleting] = useState<string|null>(null), [err,setErr] = useState('')
  const [settle,setSettle] = useState<Map<string,Settle>|null>(null)
  const [query,setQuery] = useState(''), [sort,setSort] = useState<SortKey>('terbaru'), [filter,setFilter] = useState<Filter>('semua')
  useEffect(() => { supabase.from('transactions').select(TX_COLS)
    .order('transacted_at',{ascending:false}).order('created_at',{ascending:false})
    .then(({data,error}) => {
      if (error) setErr(error.message)
      const list = (data as Tx[]|null) ?? []
      setRows(list)
      loadSettlements(list).then(setSettle).catch(() => {})                               // gagal = badge & filter status tidak tersedia
    }) }, [])

  const groups = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    const list:Row[] = rows.map(t => ({...t, ts:Date.parse(t.transacted_at), cs:Date.parse(t.created_at)}))
      .filter(t => !q || (t.merchant ?? '').toLowerCase().includes(q))
      .filter(t => { const s = settle?.get(t.id); return filter === 'semua' || !s || (filter === 'lunas' ? s.lunas : !s.lunas) })
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
  }, [rows, settle, query, sort, filter])

  async function remove(e:MouseEvent, t:Tx) {
    e.preventDefault(); e.stopPropagation()
    if (deleting || !confirmDelete(t.merchant)) return
    setDeleting(t.id); setErr('')
    try { await deleteTransaction(t.id); setRows(rs => (rs ?? []).filter(x => x.id !== t.id)) }
    catch (x) { setErr(errMsg(x, 'Gagal menghapus transaksi.')) }
    setDeleting(null)
  }
  return <main className="min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
    <header><h1 className="text-2xl font-extrabold tracking-tight">Riwayat Transaksi</h1>
      <p className="text-sm text-slate-600">{rows ? `${rows.length} transaksi tercatat.` : 'Memuat…'}</p></header>
    {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    {rows!==null && rows.length===0 && <p className="text-slate-600">Belum ada transaksi. Buat yang pertama dan masukkan menu dari struk.</p>}
    {rows!==null && rows.length>0 && <>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input type="search" className={field+' min-w-0 flex-1'} placeholder="Cari nama tempat…" aria-label="Cari nama tempat" value={query} onChange={e=>setQuery(e.target.value)}/>
        <div className="flex gap-2">
          <select style={chevron} className={sel+' min-w-0 flex-1 md:flex-none'} aria-label="Status" value={filter} disabled={!settle} onChange={e=>setFilter(e.target.value as Filter)}>
            {FILTERS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select style={chevron} className={sel+' min-w-0 flex-1 md:flex-none'} aria-label="Urutkan" value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
            {SORTS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
      {groups.length===0 && <p className="text-sm text-slate-600">Tidak ada transaksi yang cocok.{' '}
        <button onClick={()=>{setQuery(''); setFilter('semua')}} className="min-h-11 text-brand underline">Reset pencarian dan filter</button></p>}
      {groups.map(g => <section key={g.label} className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 px-1"><h2 className="min-w-0 truncate text-sm font-bold">{g.label}</h2><p className="shrink-0 text-sm tabular-nums text-slate-500">{rp(g.total)}</p></div>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {g.items.map(t => <li key={t.id} className={`flex items-center ${deleting===t.id ? 'opacity-50' : ''}`}>
            <TxLink t={t} s={settle?.get(t.id)}/>
            <button onClick={e=>remove(e,t)} disabled={!!deleting} aria-label={`Hapus transaksi ${t.merchant || 'tanpa nama tempat'}`} title="Hapus transaksi"
              className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-60">
              {deleting===t.id ? <span className="text-xs">…</span> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>}</button></li>)}</ul></section>)}</>}
  </main>
}
