const idr = new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0})
export function txDate(iso:string, timeKnown=true) {      // DD-MM-YYYY, HH:mm WIB
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'})
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  const d = `${p.day}-${p.month}-${p.year}`; return timeKnown ? `${d}, ${p.hour}:${p.minute} WIB` : d
}
/** Teks + catatan untuk tanggal (yyyy-mm-dd) dan waktu (HH:mm) hasil struk. */
export function receiptDT(date:string, time:string) {
  const text = date ? date.split('-').reverse().join('-') + (time ? ', ' + time : '') : ''
  const note = !date ? 'Tanggal & waktu transaksi tidak tercantum di struk' : !time ? 'Waktu transaksi tidak tercantum di struk' : ''
  return {text, note}
}
export const rp = (n:number) => idr.format(n)
export const wib = (d:string|Date) =>
  new Intl.DateTimeFormat('id-ID', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta'}).format(new Date(d)) + ' WIB'
