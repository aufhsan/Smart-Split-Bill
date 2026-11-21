import {FormEvent,useState} from 'react'
import {supabase} from '../lib/supabase'
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
  const inp = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3'
  return <main className="min-h-screen grid place-items-center p-6">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Smart Split Bill</h1>
      <p className="text-slate-600">Bagi tagihan makan bersama, adil dan bisa dicek ulang.</p>
      <input className={inp} type="email" required placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
      <input className={inp} type="password" required minLength={6} placeholder="Kata sandi (min. 6 karakter)" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='masuk'?'current-password':'new-password'}/>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3 disabled:opacity-60">{mode==='masuk' ? 'Masuk' : 'Daftar'}</button>
      <button type="button" onClick={()=>setMode(mode==='masuk'?'daftar':'masuk')} className="w-full text-sm text-brand underline">
        {mode==='masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}</button>
    </form></main>
}
