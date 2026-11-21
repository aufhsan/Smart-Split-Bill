import {supabase} from './supabase'
import {compute,payStatus} from './calc'
import type {Kind} from './calc'

export type Tx = {id:string; merchant:string|null; transacted_at:string; created_at:string; total:number; time_known:boolean}
export type Settle = {remaining:number; lunas:boolean}            // status pembayaran per transaksi (dihitung seperti halaman Detail)
type WithTx = {transaction_id:string}
type PartRow = WithTx & {id:string}
type ItemRow = WithTx & {id:string; name:string; total_price:number|string}
type AsgRow = WithTx & {item_id:string; participant_id:string; qty:number}
type CostRow = WithTx & {id:string; kind:Kind; name:string; percent:number|string|null; printed_amount:number|string|null; method:string}
type PayRow = WithTx & {participant_id:string; amount:number|string}

export const TX_COLS = 'id,merchant,transacted_at,created_at,time_known,total'
export const errMsg = (x:unknown, fallback:string) => typeof x === 'object' && x !== null && 'message' in x && typeof x.message === 'string' ? x.message : fallback

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
export async function loadSettlements(txs:Tx[]): Promise<Map<string,Settle>> {
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
