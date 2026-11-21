import {FormEvent,useState} from 'react'
import {supabase} from '../lib/supabase'
import AmbientBackground from '../components/AmbientBackground'
export default function Login() {
  const [mode,setMode] = useState<'masuk'|'daftar'>('masuk')
  const [email,setEmail] = useState(''), [password,setPassword] = useState('')
  const [err,setErr] = useState(''), [busy,setBusy] = useState(false)
  async function submit(e:FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const {error} = mode==='masuk'
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password})
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : error.message)
    setBusy(false)
  }
  const inp = 'w-full min-h-11 rounded-xl px-4 py-3 text-base border border-white/80 bg-white/70 ring-1 ring-slate-300/50 backdrop-blur-md focus:bg-white/95'
  return <main className="relative isolate grid min-h-screen place-items-center bg-slate-50/90 p-6">
    <AmbientBackground/>
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl p-6 border border-white/70 bg-white/65 shadow-[0_8px_30px_rgb(15,23,42,0.04)] backdrop-blur-xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Smart Split Bill</h1>
      <p className="text-slate-600">Bagi tagihan makan bersama, adil dan bisa dicek ulang.</p>
      <input className={inp} type="email" required placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
      <input className={inp} type="password" required minLength={6} placeholder="Kata sandi (min. 6 karakter)" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='masuk'?'current-password':'new-password'}/>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-brand/90 backdrop-blur-md hover:bg-brand-dark text-white font-bold py-3 disabled:opacity-60">{mode==='masuk' ? 'Masuk' : 'Daftar'}</button>
      <button type="button" onClick={()=>setMode(mode==='masuk'?'daftar':'masuk')} className="w-full text-sm text-brand underline">
        {mode==='masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}</button>
    </form></main>
}
