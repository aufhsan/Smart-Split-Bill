import {useEffect,useState} from 'react'
import {Navigate,Route,Routes} from 'react-router-dom'
import type {Session} from '@supabase/supabase-js'
import {supabase} from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Detail from './pages/Detail'
import Scan from './pages/Scan'
import Verify from './pages/Verify'
import AppLayout from './components/AppLayout'
export default function App() {
  const [session,setSession] = useState<Session|null|undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session))
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (session === undefined) return <p className="p-6">Memuat…</p>
  return <Routes>
    <Route path="/masuk" element={session ? <Navigate to="/" replace/> : <Login/>}/>
    <Route element={session ? <AppLayout onSignOut={() => { void supabase.auth.signOut() }}/> : <Navigate to="/masuk" replace/>}>
      <Route path="/" element={<Dashboard/>}/>
      <Route path="/baru" element={<Editor/>}/>
      <Route path="/transaksi/:id" element={<Detail/>}/>
      <Route path="/scan" element={<Scan/>}/>
      <Route path="/verifikasi" element={<Verify/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>
}
