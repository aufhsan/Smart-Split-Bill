import {useEffect,useMemo,useState} from 'react'
import type {ReactNode} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {rp} from '../lib/format'
import {TX_COLS,loadSettlements} from '../lib/settle'
import type {Settle,Tx} from '../lib/settle'
import TxLink from '../components/TxLink'

const RECENT = 5
const monthKey = (ms:number) => new Date(ms + 7*3600e3).toISOString().slice(0,7)      // bulan menurut WIB (UTC+7, tanpa DST)

function greeting() {                                                                // sapaan menurut jam WIB
  const h = new Date(Date.now() + 7*3600e3).getUTCHours()
  return h >= 4 && h < 11 ? 'Selamat pagi' : h < 15 && h >= 11 ? 'Selamat siang' : h >= 15 && h < 18 ? 'Selamat sore' : 'Selamat malam'
}
function SummaryCard({label,value,hint,tone}:{label:string; value:ReactNode; hint:string; tone?:string}) {
  return <div className="min-w-0 rounded-xl p-4 border border-white/70 bg-white/65 shadow-[0_8px_30px_rgb(15,23,42,0.04)] backdrop-blur-xl">
    <p className="truncate text-sm font-semibold text-slate-600">{label}</p>
    <p className={`mt-1 truncate text-2xl font-extrabold tabular-nums ${tone ?? ''}`}>{value}</p>
    <p className="mt-1 truncate text-xs text-slate-500">{hint}</p></div>
}

export default function Dashboard() {
  const [rows,setRows] = useState<Tx[]|null>(null), [err,setErr] = useState('')
  const [settle,setSettle] = useState<Map<string,Settle>|null>(null), [settleErr,setSettleErr] = useState(false)
  useEffect(() => { supabase.from('transactions').select(TX_COLS)
    .order('transacted_at',{ascending:false}).order('created_at',{ascending:false})       // terbaru dulu, lalu created_at terbaru
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

  const loading = rows === null
  const settleVal = (v:ReactNode) => settleErr ? '—' : settle ? v : '…'
  return <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
    <header>
      <div className="min-w-0"><h1 className="truncate text-2xl font-extrabold tracking-tight">{greeting()} 👋</h1>
        <p className="text-sm text-slate-600">Ringkasan patungan dan pembayaran Anda.</p></div></header>

    <section aria-label="Ringkasan" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <SummaryCard label="Total Pengeluaran" value={loading ? '…' : rp(stats.total)} hint={loading ? ' ' : `Bulan ini: ${rp(stats.month)}`}/>
      <SummaryCard label="Belum Lunas / Menunggu Pembayaran" tone={settle && stats.owed > 0 ? 'text-amber-700' : ''}
        value={loading ? '…' : settleVal(rp(stats.owed))} hint={loading ? ' ' : settleErr ? 'Status pembayaran gagal dimuat' : settle ? `${stats.open} transaksi belum lunas` : 'Menghitung…'}/>
      <SummaryCard label="Total Transaksi" value={loading ? '…' : stats.count}
        hint={loading ? ' ' : settleErr ? ' ' : settle ? `${stats.count - stats.open} lunas` : 'Menghitung…'}/></section>

    {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    {loading ? <p>Memuat…</p> : rows.length===0
      ? <p className="text-slate-600">Belum ada transaksi. Buat yang pertama dan masukkan menu dari struk.</p>
      : <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Transaksi Terbaru</h2>
          <Link to="/riwayat" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline">Lihat semua →</Link></div>
        <ul className="space-y-2">
          {rows.slice(0, RECENT).map(t => <li key={t.id} className="flex overflow-hidden rounded-xl border border-white/60 bg-white/50 hover:bg-white/80"><TxLink t={t} s={settle?.get(t.id)}/></li>)}</ul></section>}
  </main>
}
