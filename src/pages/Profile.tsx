import {useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import type {User} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'

type Props = {onSignOut: () => void}
type Notice = {kind:'ok'|'err'; text:string} | null

const ACCENT = 'bg-[#466d6a] hover:bg-[#385856]'
const inp = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base'   // text-base (16px) mencegah auto-zoom di HP
const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5'
const primaryBtn = `min-h-11 w-full rounded-xl px-5 py-2.5 font-bold text-white disabled:opacity-60 sm:w-auto ${ACCENT}`
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function authMsg(e:{message:string; code?:string}): string {
  switch (e.code) {
    case 'same_password': return 'Password baru tidak boleh sama dengan password lama.'
    case 'weak_password': return 'Password terlalu lemah. Gunakan kombinasi yang lebih sulit ditebak.'
    case 'email_exists': return 'Email tersebut sudah dipakai akun lain.'
    case 'email_address_invalid': return 'Format email tidak valid.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.'
    case 'reauthentication_needed': return 'Demi keamanan, keluar lalu masuk kembali sebelum mengganti password.'
    case 'session_not_found': return 'Sesi Anda sudah berakhir. Silakan masuk kembali.'
    default: return e.message
  }
}
function Message({n}:{n:Notice}) {
  if (!n) return null
  return n.kind === 'ok'
    ? <p role="status" className="break-words rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{n.text}</p>
    : <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{n.text}</p>
}

export default function Profile({onSignOut}: Props) {
  const [user,setUser] = useState<User|null>(null), [loadErr,setLoadErr] = useState(false)
  const [email,setEmail] = useState(''), [emailBusy,setEmailBusy] = useState(false), [emailMsg,setEmailMsg] = useState<Notice>(null)
  const [pw,setPw] = useState(''), [pw2,setPw2] = useState(''), [pwBusy,setPwBusy] = useState(false), [pwMsg,setPwMsg] = useState<Notice>(null)

  async function loadUser() {
    const {data,error} = await supabase.auth.getUser()
    if (error || !data.user) setLoadErr(true); else { setUser(data.user); setLoadErr(false) }
  }
  useEffect(() => { void loadUser() }, [])

  async function changeEmail(e:FormEvent) {
    e.preventDefault(); setEmailMsg(null)
    const next = email.trim().toLowerCase()
    if (!EMAIL_RE.test(next)) return setEmailMsg({kind:'err', text:'Masukkan alamat email yang valid, misalnya nama@gmail.com.'})
    if (next === (user?.email ?? '').toLowerCase()) return setEmailMsg({kind:'err', text:'Email baru sama dengan email Anda saat ini.'})
    setEmailBusy(true)
    const {error} = await supabase.auth.updateUser({email:next})
    setEmailBusy(false)
    if (error) return setEmailMsg({kind:'err', text:authMsg(error)})
    setEmail('')
    setEmailMsg({kind:'ok', text:`Tautan konfirmasi sudah dikirim ke ${next}. Email baru baru berlaku setelah Anda membuka tautan itu. Jika diminta, konfirmasi juga dari email lama Anda.`})
    void loadUser()
  }
  async function changePassword(e:FormEvent) {
    e.preventDefault(); setPwMsg(null)
    if (pw.length < 6) return setPwMsg({kind:'err', text:'Password baru minimal 6 karakter.'})
    if (pw !== pw2) return setPwMsg({kind:'err', text:'Konfirmasi password tidak sama dengan password baru.'})
    setPwBusy(true)
    const {error} = await supabase.auth.updateUser({password:pw})
    setPwBusy(false)
    if (error) return setPwMsg({kind:'err', text:authMsg(error)})
    setPw(''); setPw2('')
    setPwMsg({kind:'ok', text:'Password berhasil diubah. Gunakan password baru saat masuk berikutnya.'})
  }

  return <main className="mx-auto w-full min-w-0 max-w-2xl space-y-5 p-4 sm:p-6 lg:p-8">
    <header><h1 className="text-2xl font-extrabold tracking-tight">Profil</h1>
      <p className="text-sm text-slate-600">Kelola email, password, dan sesi akun Anda.</p></header>

    <section className={card} aria-labelledby="akun-h"><h2 id="akun-h" className="font-bold">Akun</h2>
      <div className="min-w-0"><p className="text-sm text-slate-500">Email saat ini</p>
        <p className="break-all text-lg font-semibold">{user ? user.email ?? '—' : loadErr ? 'Gagal memuat akun.' : 'Memuat…'}</p></div>
      {user?.new_email && <p className="break-words rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Menunggu konfirmasi untuk email baru: <span className="font-semibold">{user.new_email}</span>. Buka tautan di kotak masuk email tersebut.</p>}</section>

    <form onSubmit={changeEmail} className={card} noValidate aria-labelledby="email-h"><h2 id="email-h" className="font-bold">Ganti Gmail / Email</h2>
      <label className="block space-y-1"><span className="text-sm font-semibold text-slate-700">Email baru</span>
        <input className={inp} type="email" inputMode="email" autoComplete="email" placeholder="nama@gmail.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <p className="text-xs text-slate-500">Kami mengirim tautan konfirmasi ke email baru. Email lama tetap dipakai sampai tautan dikonfirmasi.</p>
      <Message n={emailMsg}/>
      <button disabled={emailBusy || !email.trim()} className={primaryBtn}>{emailBusy ? 'Mengirim…' : 'Ganti email'}</button></form>

    <form onSubmit={changePassword} className={card} noValidate aria-labelledby="pw-h"><h2 id="pw-h" className="font-bold">Ubah Password</h2>
      <label className="block space-y-1"><span className="text-sm font-semibold text-slate-700">Password baru</span>
        <input className={inp} type="password" autoComplete="new-password" minLength={6} placeholder="Minimal 6 karakter" value={pw} onChange={e=>setPw(e.target.value)}/></label>
      <label className="block space-y-1"><span className="text-sm font-semibold text-slate-700">Konfirmasi password baru</span>
        <input className={inp} type="password" autoComplete="new-password" placeholder="Ulangi password baru" value={pw2} onChange={e=>setPw2(e.target.value)}/></label>
      <Message n={pwMsg}/>
      <button disabled={pwBusy || !pw || !pw2} className={primaryBtn}>{pwBusy ? 'Menyimpan…' : 'Ubah password'}</button></form>

    <section className={card} aria-labelledby="out-h"><h2 id="out-h" className="font-bold">Keluar Akun</h2>
      <p className="text-sm text-slate-600">Akhiri sesi di perangkat ini. Data transaksi Anda tetap tersimpan.</p>
      <button type="button" onClick={onSignOut} className="min-h-11 w-full rounded-xl border border-red-300 px-5 py-2.5 font-bold text-red-700 hover:bg-red-50 sm:w-auto">Keluar</button></section>
  </main>
}
