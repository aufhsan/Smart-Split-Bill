import {useEffect,useMemo,useState} from 'react'
import type {MouseEvent,ReactNode} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {rp,txDate} from '../lib/format'
import {clearAll} from '../lib/draft'
import {compute,payStatus} from '../lib/calc'
import type {Kind} from '../lib/calc'
import {confirmDelete,deleteTransaction} from '../lib/tx'

type Tx = {id:string; merchant:string|null; transacted_at:string; created_at:string; total:number; time_known:boolean}
type Row = Tx & {ts:number; cs:number}
type SortKey = 'terbaru'|'terlama'|'terbesar'|'terkecil'
type Settle = {remaining:number; lunas:boolean}            // status pembayaran per transaksi (dihitung seperti halaman Detail)
type WithTx = {transaction_id:string}
type PartRow = WithTx & {id:string}
type ItemRow = WithTx & {id:string; name:string; total_price:number|string}
type AsgRow = WithTx & {item_id:string; participant_id:string; qty:number}
type CostRow = WithTx & {id:string; kind:Kind; name:string; percent:number|string|null; printed_amount:number|string|null; method:string}
type PayRow = WithTx & {participant_id:string; amount:number|string}

const SORTS:[SortKey,string][] = [['terbaru','Terbaru'],['terlama','Terlama'],['terbesar','Nominal terbesar'],['terkecil','Nominal terkecil']]
const monthLabel = new Intl.DateTimeFormat('id-ID', {month:'long', year:'numeric', timeZone:'Asia/Jakarta'})
const monthKey = (ms:number) => new Date(ms + 7*3600e3).toISOString().slice(0,7)      // bulan menurut WIB (UTC+7, tanpa DST)
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const BADGE = {lunas:'bg-emerald-100 text-emerald-900', belum:'bg-amber-100 text-amber-900'}
const errMsg = (x:unknown, fallback:string) => typeof x === 'object' && x !== null && 'message' in x && typeof x.message === 'string' ? x.message : fallback

function greeting() {                                                                // sapaan menurut jam WIB
  const h = new Date(Date.now() + 7*3600e3).getUTCHours()
  return h >= 4 && h < 11 ? 'Selamat pagi' : h < 15 && h >= 11 ? 'Selamat siang' : h >= 15 && h < 18 ? 'Selamat sore' : 'Selamat malam'
}
async function fetchAll<T>(table:string, cols:string): Promise<T[]> {                 // halaman 1000 baris agar tidak terpotong batas default Supabase
  const out:T[] = []
  for (let from = 0; ; from += 1000) {
    const {data, error} = await supabase.from(table).select(cols).order('id').range(from, from + 999)
    if (error) throw error
    const page = (data ?? []) as unknown as T[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}
function groupBy<T extends WithTx>(list:T[]) {
  const m = new Map<string,T[]>()
  for (const r of list) { const a = m.get(r.transaction_id); if (a) a.push(r); else m.set(r.transaction_id, [r]) }
  return m
}
async function loadSettlements(txs:Tx[]): Promise<Map<string,Settle>> {
  const [pa,it,as,co,py] = await Promise.all([fetchAll<PartRow>('participants','id,transaction_id'), fetchAll<ItemRow>('items','id,transaction_id,name,total_price'),
    fetchAll<AsgRow>('item_assignments','id,transaction_id,item_id,participant_id,qty'), fetchAll<CostRow>('additional_costs','id,transaction_id,kind,name,percent,printed_amount,method'),
    fetchAll<PayRow>('payments','id,transaction_id,participant_id,amount')])
  const gPa = groupBy(pa), gIt = groupBy(it), gAs = groupBy(as), gCo = groupBy(co), gPy = groupBy(py)
  const out = new Map<string,Settle>()
  for (const t of txs) {
    const parts = gPa.get(t.id) ?? [], pays = gPy.get(t.id) ?? []
    const res = compute(parts.map(p => p.id),
      (gIt.get(t.id) ?? []).map(i => ({id:i.id, name:i.name, total:Number(i.total_price)})),
      (gAs.get(t.id) ?? []).map(a => ({itemId:a.item_id, pid:a.participant_id, qty:a.qty})),
      (gCo.get(t.id) ?? []).map(c => ({id:c.id, kind:c.kind, name:c.name, percent:c.percent == null ? null : Number(c.percent),
        amount:c.printed_amount == null ? null : Number(c.printed_amount), method:c.method === 'equal' ? 'equal' : 'proportional'})), null)
    const remaining = parts.length === 0 ? Number(t.total)                              // belum ada peserta = belum ada yang membayar
      : res.persons.reduce((s,p) => s + payStatus(p.total, pays.filter(y => y.participant_id === p.pid).reduce((a,y) => a + Number(y.amount), 0)).sisa, 0)
    out.set(t.id, {remaining, lunas: remaining <= 0})
  }
  return out
}

function SummaryCard({label,value,hint,tone}:{label:string; value:ReactNode; hint:string; tone?:string}) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-sm font-semibold text-slate-600 truncate">{label}</p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums truncate ${tone ?? ''}`}>{value}</p>
    <p className="mt-1 text-xs text-slate-500 truncate">{hint}</p></div>
}

export default function Dashboard() {
  const [rows,setRows] = useState<Tx[]|null>(null), [deleting,setDeleting] = useState<string|null>(null), [err,setErr] = useState('')
  const [settle,setSettle] = useState<Map<string,Settle>|null>(null), [settleErr,setSettleErr] = useState(false)
  const [query,setQuery] = useState(''), [sort,setSort] = useState<SortKey>('terbaru')
  useEffect(() => { supabase.from('transactions').select('id,merchant,transacted_at,created_at,time_known,total')
    .order('transacted_at',{ascending:false}).order('created_at',{ascending:false})       // urutan dasar dari server: terbaru, lalu created_at terbaru
    .then(({data,error}) => {
      if (error) setErr(error.message)
      const list = (data as Tx[]|null) ?? []
      setRows(list)
      loadSettlements(list).then(setSettle).catch(() => setSettleErr(true))
    }) }, [])

  const stats = useMemo(() => {
    const list = rows ?? [], nowKey = monthKey(Date.now())
    const total = list.reduce((s,t) => s + Number(t.total), 0)
    const month = list.filter(t => monthKey(Date.parse(t.transacted_at)) === nowKey).reduce((s,t) => s + Number(t.total), 0)
    let owed = 0, open = 0
    if (settle) for (const t of list) { const s = settle.get(t.id); if (s && !s.lunas) { owed += s.remaining; open++ } }
    return {total, month, owed, open, count:list.length}
  }, [rows, settle])

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
    catch (x) { setErr(errMsg(x, 'Gagal menghapus transaksi.')) }
    setDeleting(null)
  }
  const loading = rows === null
  const settleVal = (v:ReactNode) => settleErr ? '—' : settle ? v : '…'
  return <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h1 className="text-2xl font-extrabold tracking-tight truncate">{greeting()} 👋</h1>
        <p className="text-sm text-slate-600">Ringkasan patungan dan pembayaran Anda.</p></div>
      <div className="flex gap-2">
        <Link to="/scan" onClick={clearAll} className="flex-1 sm:flex-none whitespace-nowrap text-center rounded-xl bg-brand hover:bg-brand-dark text-white font-bold px-4 py-2.5">+ Scan Struk</Link>
        <Link to="/baru" onClick={clearAll} className="flex-1 sm:flex-none whitespace-nowrap text-center rounded-xl border border-brand text-brand font-bold px-4 py-2.5">Isi Manual</Link></div></header>

    <section aria-label="Ringkasan" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <SummaryCard label="Total Pengeluaran" value={loading ? '…' : rp(stats.total)} hint={loading ? ' ' : `Bulan ini: ${rp(stats.month)}`}/>
      <SummaryCard label="Belum Lunas / Menunggu Pembayaran" tone={settle && stats.owed > 0 ? 'text-amber-700' : ''}
        value={loading ? '…' : settleVal(rp(stats.owed))} hint={loading ? ' ' : settleErr ? 'Status pembayaran gagal dimuat' : settle ? `${stats.open} transaksi belum lunas` : 'Menghitung…'}/>
      <SummaryCard label="Total Transaksi" value={loading ? '…' : stats.count}
        hint={loading ? ' ' : settleErr ? ' ' : settle ? `${stats.count - stats.open} lunas` : 'Menghitung…'}/></section>

    {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
    {loading ? <p>Memuat…</p> : rows.length===0
      ? <p className="text-slate-600">Belum ada transaksi. Buat yang pertama dan masukkan menu dari struk.</p>
      : <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-extrabold">Riwayat Transaksi</h2>
          <div className="flex gap-2 sm:w-96">
            <input type="search" className={field+' min-w-0 flex-1'} placeholder="Cari nama tempat…" aria-label="Cari nama tempat" value={query} onChange={e=>setQuery(e.target.value)}/>
            <select className={field+' max-w-[9.5rem] shrink-0'} aria-label="Urutkan" value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
              {SORTS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
        {groups.length===0 && <p className="text-slate-600 text-sm">Tidak ada transaksi yang cocok dengan “{query.trim()}”. <button onClick={()=>setQuery('')} className="underline text-brand">Hapus pencarian</button></p>}
        {groups.map(g => <section key={g.label} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 px-1"><h3 className="text-sm font-bold min-w-0 truncate">{g.label}</h3><p className="text-sm tabular-nums text-slate-500 shrink-0">{rp(g.total)}</p></div>
          <ul className="divide-y divide-slate-200 rounded-xl bg-white border border-slate-200">
            {g.items.map(t => { const s = settle?.get(t.id)
              return <li key={t.id} className={`flex items-center ${deleting===t.id ? 'opacity-50' : ''}`}>
              <Link to={`/transaksi/${t.id}`} className="flex flex-1 min-w-0 items-center justify-between gap-3 p-4 hover:bg-paper">
                <div className="min-w-0"><p className="font-semibold truncate">{t.merchant || 'Tanpa nama tempat'}</p><p className="text-sm text-slate-500 truncate">{txDate(t.transacted_at, t.time_known)}</p></div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                  {s && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.lunas ? BADGE.lunas : BADGE.belum}`}>{s.lunas ? 'Lunas' : 'Belum Lunas'}</span>}
                  <p className="font-bold tabular-nums">{rp(t.total)}</p></div></Link>
              <button onClick={e=>remove(e,t)} disabled={!!deleting} aria-label={`Hapus transaksi ${t.merchant || 'tanpa nama tempat'}`} title="Hapus transaksi"
                className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-60">
                {deleting===t.id ? <span className="text-xs">…</span> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>}</button></li> })}</ul></section>)}</section>}
  </main>
}
