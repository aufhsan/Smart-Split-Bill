// Mesin perhitungan: semua dalam rupiah bulat. Sisa pembulatan dibagi konsisten (largest remainder).
export type Kind = 'tax'|'service'|'discount'|'other'
export type Method = 'equal'|'proportional'
export type Item = {id:string; name:string; total:number}
export type Asg = {itemId:string; pid:string; qty:number}
export type Cost = {id:string; kind:Kind; name:string; percent:number|null; amount:number|null; method:Method}

/** Bagi `total` menurut bobot; jumlah hasil selalu persis = total. */
export function alloc(total:number, w:number[]): number[] {
  const s = w.reduce((a,b)=>a+b, 0)
  if (!s) return w.map(()=>0)
  const raw = w.map(x => total*x/s), base = raw.map(Math.floor)
  let rem = total - base.reduce((a,b)=>a+b, 0)
  raw.map((r,i)=>[r-base[i], i] as const).sort((a,b)=>b[0]-a[0] || a[1]-b[1])
     .forEach(([,i]) => { if (rem > 0) { base[i]++; rem-- } })
  return base
}

export function compute(pids:string[], items:Item[], asgs:Asg[], costs:Cost[], receiptTotal?:number|null) {
  const subtotal = pids.map(()=>0), unassigned:string[] = []
  for (const it of items) {
    const w = pids.map(p => asgs.filter(a=>a.itemId===it.id && a.pid===p).reduce((s,a)=>s+a.qty, 0))
    if (!w.some(x=>x>0)) { unassigned.push(it.id); continue }
    alloc(it.total, w).forEach((v,i)=>subtotal[i]+=v)
  }
  const base = subtotal.reduce((a,b)=>a+b, 0)
  const parts = pids.map(()=> ({} as Record<string,number>))
  const costRows = costs.map(c => {
    const byPercent = c.percent!=null ? Math.round(c.percent*base/100) : null
    const amount = c.amount ?? byPercent ?? 0        // nominal struk jadi acuan
    const diff = c.amount!=null && byPercent!=null ? c.amount - byPercent : 0
    alloc(amount, c.method==='equal' ? pids.map(()=>1) : subtotal).forEach((v,i)=>parts[i][c.id]=v)
    return {id:c.id, amount, byPercent, diff}
  })
  const persons = pids.map((pid,i) => {
    let total = subtotal[i]
    for (const c of costs) total += (c.kind==='discount' ? -1 : 1) * (parts[i][c.id] ?? 0)
    return {pid, subtotal:subtotal[i], parts:parts[i], total}
  })
  const grand = persons.reduce((s,p)=>s+p.total, 0)
  return {persons, costRows, itemsTotal:base, grand, unassigned,
          reconDiff: receiptTotal!=null ? receiptTotal - grand : null}
}

/** Status pembayaran otomatis; kelebihan bayar ditampilkan terpisah, sisa tidak pernah negatif. */
export function payStatus(total:number, paid:number) {
  const status = paid<=0 ? 'Belum Bayar' : paid<total ? 'Dibayar Sebagian' : 'Lunas'
  return {status, sisa:Math.max(0,total-paid), lebih:Math.max(0,paid-total)}
}
