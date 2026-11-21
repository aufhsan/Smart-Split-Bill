import {useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabase'
import {alloc,compute,Cost,Item,Kind} from '../lib/calc'
import {rp,receiptDT} from '../lib/format'
import {loadDraft,clearAll} from '../lib/draft'
const uid = () => crypto.randomUUID()
// Awalan jumlah di nama menu: "2x Bakwan", "2 x Bakwan", "2× Bakwan"
const QTY = /^\s*(\d{1,2})\s*[x×X]\s+(.+)$/
const parseQty = (name:string) => { const m = name.match(QTY); return m && Number(m[1]) > 1 ? {qty:Number(m[1]), name:m[2].trim()} : null }
const num = (v:string) => Math.max(0, Math.round(Number(v)||0))
const inp = 'rounded-lg border border-slate-300 bg-white px-3 py-2 w-full'
const card = 'rounded-xl bg-white border border-slate-200 p-4 space-y-3'
const KIND:Record<Kind,string> = {tax:'PPN/Pajak', service:'Service', discount:'Diskon', other:'Biaya lain'}
export default function Editor() {
  const nav = useNavigate()
  const [dr] = useState(loadDraft)
  const [merchant,setMerchant] = useState(dr?.merchant ?? ''), [receiptTotal,setReceiptTotal] = useState(dr?.receiptTotal ? String(dr.receiptTotal) : '')
  const [people,setPeople] = useState<{id:string;name:string}[]>([]), [newName,setNewName] = useState('')
  const [rdate,setRdate] = useState(dr?.date ?? ''), [rtime,setRtime] = useState(dr?.time ?? '')
  const dt = receiptDT(rdate, rtime)
  const [items,setItems] = useState<Item[]>(dr?.items ?? []), [qty,setQty] = useState<Record<string,number>>({})
  const [costs,setCosts] = useState<Cost[]>(dr?.costs ?? []), [busy,setBusy] = useState(false), [err,setErr] = useState('')
  const pids = people.map(p=>p.id)
  const asgs = Object.entries(qty).filter(([,q])=>q>0).map(([k,q]) => {const [itemId,pid]=k.split('|'); return {itemId,pid,qty:q}})
    .filter(a => items.some(i=>i.id===a.itemId) && people.some(p=>p.id===a.pid))   // abaikan sisa pilihan menu/peserta yang sudah dihapus
  const res = useMemo(() => compute(pids, items, asgs, costs, receiptTotal ? num(receiptTotal) : null), [people,items,qty,costs,receiptTotal])
  const nm = (id:string) => people.find(p=>p.id===id)?.name ?? ''
  const patchItem = (id:string, p:Partial<Item>) => setItems(items.map(i=>i.id===id?{...i,...p}:i))
  const patchCost = (id:string, p:Partial<Cost>) => setCosts(costs.map(c=>c.id===id?{...c,...p}:c))
  const addPerson = () => { const n=newName.trim(); if(n){setPeople([...people,{id:uid(),name:n}]); setNewName('')} }
  const addCost = (kind:Kind) => setCosts([...costs,{id:uid(),kind,name:KIND[kind],percent:null,amount:null,method:kind==='other'?'equal':'proportional'}])

  const isOn = (itemId:string, pid:string) => (qty[itemId+'|'+pid] ?? 0) > 0
  const toggle = (itemId:string, pid:string) => setQty({...qty, [itemId+'|'+pid]: isOn(itemId,pid) ? 0 : 1})
  const allOn = (itemId:string) => people.length > 0 && people.every(p => isOn(itemId,p.id))
  const toggleAll = (itemId:string) => { const v = allOn(itemId) ? 0 : 1; const n = {...qty}; people.forEach(p => n[itemId+'|'+p.id] = v); setQty(n) }
  function splitItem(id:string) {                      // "2× Bakwan 5000" -> 2 baris satuan; total tetap sama, pilihan peserta diwariskan
    const i = items.findIndex(x=>x.id===id), q = i<0 ? null : parseQty(items[i].name); if (!q) return
    const news = alloc(items[i].total, Array(q.qty).fill(1)).map(t => ({id:uid(), name:q.name, total:t}))
    const nq = {...qty}, chosen = people.filter(p => isOn(id,p.id))
    Object.keys(nq).filter(k => k.startsWith(id+'|')).forEach(k => delete nq[k])
    news.forEach(n => chosen.forEach(p => nq[n.id+'|'+p.id] = 1))
    setQty(nq); setItems([...items.slice(0,i), ...news, ...items.slice(i+1)])
  }
  async function save() {
    setErr('')
    if (!people.length || !items.length) return setErr('Tambahkan minimal satu peserta dan satu menu.')
    if (res.unassigned.length) return setErr('Masih ada menu yang belum dibagikan ke peserta.')
    setBusy(true)
    try {
      const {data:{user}} = await supabase.auth.getUser(); const tx = uid()
      const run = async (q:PromiseLike<{error:any}>) => { const {error}=await q; if(error) throw error }
      await run(supabase.from('transactions').insert({id:tx,user_id:user!.id,merchant:merchant||null, ...(rdate ? {transacted_at:`${rdate}T${rtime||'00:00'}:00+07:00`, time_known:!!rtime} : {}),
        receipt_total:receiptTotal?num(receiptTotal):null,subtotal:res.itemsTotal,total:res.grand}))
      await run(supabase.from('participants').insert(people.map((p,i)=>({id:p.id,transaction_id:tx,name:p.name,position:i}))))
      await run(supabase.from('items').insert(items.map(i=>({id:i.id,transaction_id:tx,name:i.name||'Menu',total_price:i.total}))))
      if (asgs.length) await run(supabase.from('item_assignments').insert(asgs.map(a=>({transaction_id:tx,item_id:a.itemId,participant_id:a.pid,qty:a.qty}))))
      if (costs.length) await run(supabase.from('additional_costs').insert(costs.map(c=>({id:c.id,transaction_id:tx,kind:c.kind,name:c.name,
        percent:c.percent,printed_amount:c.amount,computed_amount:res.costRows.find(r=>r.id===c.id)!.amount,method:c.method}))))
      if (dr?.receiptPath) await run(supabase.from('receipts').insert({transaction_id:tx,storage_path:dr.receiptPath}))
      clearAll(); nav('/')
    } catch (e:any) { setErr(e.message ?? 'Gagal menyimpan.'); setBusy(false) }
  }

  return <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-32">
    <h1 className="text-2xl font-extrabold tracking-tight">Transaksi baru</h1>
    <section className={card}><h2 className="font-bold">Tempat</h2>
      <input className={inp} placeholder="Nama tempat (opsional)" value={merchant} onChange={e=>setMerchant(e.target.value)}/>
      <div className="grid grid-cols-2 gap-2"><input className={inp+' min-w-0'} type="date" aria-label="Tanggal transaksi" value={rdate} onChange={e=>setRdate(e.target.value)}/>
        <input className={inp+' min-w-0'} type="time" aria-label="Waktu transaksi" value={rtime} onChange={e=>setRtime(e.target.value)}/></div>
      <p className="text-sm">{dt.text && <span className="font-semibold">{dt.text}</span>}{(dr || dt.text) ? (dt.note && <span className="text-slate-500">{dt.text ? ' · ' : ''}{dt.note}</span>) : <span className="text-slate-500">Kosong = memakai waktu saat disimpan.</span>}</p>
      <input className={inp} inputMode="numeric" placeholder="Total di struk (opsional, untuk pengecekan)" value={receiptTotal} onChange={e=>setReceiptTotal(e.target.value)}/></section>

    <section className={card}><h2 className="font-bold">Peserta</h2>
      <div className="flex gap-2"><input className={inp+' min-w-0'} placeholder="Nama peserta" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPerson()}/>
        <button onClick={addPerson} className="rounded-lg bg-brand text-white font-bold px-4">Tambah</button></div>
      <div className="flex flex-wrap gap-2">{people.map(p=><span key={p.id} className="rounded-full bg-paper border border-slate-300 pl-3 pr-1 py-1 text-sm">{p.name}
        <button aria-label={`Hapus ${p.name}`} className="ml-1 px-2" onClick={()=>setPeople(people.filter(x=>x.id!==p.id))}>×</button></span>)}</div></section>

    <section className={card}><h2 className="font-bold">Menu dan pembagiannya</h2>
      {items.map(it => <div key={it.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
        <div className="flex flex-wrap gap-2"><input className={inp+' min-w-0 flex-1 basis-44'} placeholder="Nama menu" value={it.name} onChange={e=>patchItem(it.id,{name:e.target.value})}/>
          <input className={inp+' min-w-0 flex-1 basis-32 sm:flex-none sm:w-40'} inputMode="numeric" placeholder="Harga total" value={it.total||''} onChange={e=>patchItem(it.id,{total:num(e.target.value)})}/>
          {parseQty(it.name) && <button aria-label={`Pecah menjadi ${parseQty(it.name)!.qty} item satuan`} onClick={()=>splitItem(it.id)} className="rounded-lg border border-brand text-brand text-xs font-bold px-2">Pecah</button>}
          <button aria-label="Hapus menu" onClick={()=>setItems(items.filter(x=>x.id!==it.id))} className="px-2">×</button></div>
        <p className="text-xs text-slate-500">Pilih siapa yang ikut. Lebih dari satu orang = dibagi rata.</p>
        {people.length===0 ? <p className="text-xs text-slate-500">Tambahkan peserta dulu.</p> :
        <div className="flex flex-wrap items-center gap-2">
          {people.map(p => { const on = isOn(it.id,p.id)
            return <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={()=>toggle(it.id,p.id)}
              className={`min-h-10 max-w-[11rem] truncate rounded-full border px-3 text-sm font-semibold ${on ? 'bg-brand border-brand text-white' : 'bg-white border-slate-300 text-ink'}`}>{on ? '✓ ' : ''}{p.name}</button> })}
          {people.length>2 && <button type="button" onClick={()=>toggleAll(it.id)} className="min-h-10 rounded-full px-3 text-sm font-bold text-brand underline">{allOn(it.id) ? 'Kosongkan' : 'Semua'}</button>}</div>}
        {res.unassigned.includes(it.id) && <p className="text-xs text-amber-700">Belum dibagikan ke siapa pun.</p>}</div>)}
      <button onClick={()=>setItems([...items,{id:uid(),name:'',total:0}])} className="rounded-lg border border-brand text-brand font-bold px-4 py-2">+ Tambah menu</button></section>

    <section className={card}><h2 className="font-bold">Pajak, service, diskon, biaya lain</h2>
      {costs.map(c => <div key={c.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
        <div className="flex gap-2"><input className={inp} value={c.name} onChange={e=>patchCost(c.id,{name:e.target.value})}/>
          <button aria-label="Hapus biaya" onClick={()=>setCosts(costs.filter(x=>x.id!==c.id))} className="px-2">×</button></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className={inp} inputMode="decimal" placeholder="Persen %" value={c.percent??''} onChange={e=>patchCost(c.id,{percent:e.target.value===''?null:Number(e.target.value)})}/>
          <input className={inp} inputMode="numeric" placeholder="Nominal struk" value={c.amount??''} onChange={e=>patchCost(c.id,{amount:e.target.value===''?null:num(e.target.value)})}/>
          <select className={inp} value={c.method} onChange={e=>patchCost(c.id,{method:e.target.value as Cost['method']})}>
            <option value="proportional">Proporsional</option><option value="equal">Rata</option></select></div>
        {(() => { const r = res.costRows.find(x=>x.id===c.id); return r && r.diff!==0 &&
          <p className="text-xs text-amber-700">Nominal struk {rp(c.amount!)} berbeda {rp(r.diff)} dari hasil persentase ({rp(r.byPercent!)}). Nominal struk dipakai.</p> })()}</div>)}
      <div className="flex flex-wrap gap-2">{(Object.keys(KIND) as Kind[]).map(k=>
        <button key={k} onClick={()=>addCost(k)} className="rounded-lg border border-brand text-brand font-bold px-3 py-2 text-sm">+ {KIND[k]}</button>)}</div></section>

    <section className={card}><h2 className="font-bold">Rincian per orang</h2>
      {people.length===0 && <p className="text-slate-500 text-sm">Tambahkan peserta untuk melihat hitungan.</p>}
      {res.persons.map(p => <div key={p.pid} className="rounded-lg bg-paper p-3 text-sm space-y-1">
        <div className="flex justify-between font-bold text-base"><span className="truncate">{nm(p.pid)}</span><span className="tabular-nums">{rp(p.total)}</span></div>
        <div className="flex justify-between"><span>Subtotal menu</span><span className="tabular-nums">{rp(p.subtotal)}</span></div>
        {costs.map(c => <div key={c.id} className="flex justify-between gap-3 text-slate-600">
          <span>{c.kind==='discount'?'−':'+'} {c.name} <em className="not-italic text-xs">({c.percent!=null&&c.amount==null?`${c.percent}% dari `:''}{c.method==='equal'?'dibagi rata':'proporsional subtotal'})</em></span>
          <span className="tabular-nums">{rp(p.parts[c.id]??0)}</span></div>)}</div>)}
      <div className="flex justify-between font-extrabold text-lg"><span>Total semua peserta</span><span className="tabular-nums">{rp(res.grand)}</span></div>
      {res.reconDiff!==null && <p role="status" className={res.reconDiff===0?'text-brand text-sm':'text-red-700 text-sm'}>
        {res.reconDiff===0 ? 'Total cocok dengan struk.' : `Selisih dengan total struk: ${rp(res.reconDiff)}. Periksa harga atau biaya.`}</p>}</section>

    {err && <p role="alert" className="text-red-700">{err}</p>}
    <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><div className="max-w-2xl mx-auto">
      <button disabled={busy} onClick={save} className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3 disabled:opacity-60">{busy?'Menyimpan…':'Simpan transaksi'}</button></div></div>
  </main>
}
