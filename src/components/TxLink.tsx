import {Link} from 'react-router-dom'
import {rp,txDate} from '../lib/format'
import type {Settle,Tx} from '../lib/settle'

const BADGE = {lunas:'bg-emerald-100 text-emerald-900', belum:'bg-amber-100 text-amber-900'}

/** Baris transaksi yang bisa diklik: nama tempat, tanggal, badge status, dan total. Dipakai di Dashboard dan Riwayat. */
export default function TxLink({t,s}:{t:Tx; s?:Settle}) {
  return <Link to={`/transaksi/${t.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 hover:bg-paper">
    <div className="min-w-0"><p className="truncate font-semibold">{t.merchant || 'Tanpa nama tempat'}</p><p className="truncate text-sm text-slate-500">{txDate(t.transacted_at, t.time_known)}</p></div>
    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
      {s && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.lunas ? BADGE.lunas : BADGE.belum}`}>{s.lunas ? 'Lunas' : 'Belum Lunas'}</span>}
      <p className="font-bold tabular-nums">{rp(t.total)}</p></div></Link>
}
