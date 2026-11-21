import type {ReactNode} from 'react'
import {Link,Outlet,useLocation} from 'react-router-dom'
import {clearAll} from '../lib/draft'

type Props = {onSignOut: () => void}
type IconProps = {className?: string}
type Item = {to: string; label: string; icon: (p: IconProps) => JSX.Element; active: (path: string) => boolean}

const svg = (children: ReactNode) => ({className}: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{children}</svg>
)
const IconHome = svg(<path d="M3 11l9-8 9 8M5 10v10h14V10"/>)
const IconList = svg(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>)
const IconScan = svg(<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16"/>)
const IconEdit = svg(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>)
const IconOut = svg(<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>)

// "Riwayat" = daftar transaksi. Halaman Dashboard sudah menampilkannya, jadi Dashboard aktif di "/" dan Riwayat aktif di detail transaksi.
const NAV: Item[] = [
  {to: '/', label: 'Dashboard', icon: IconHome, active: p => p === '/'},
  {to: '/', label: 'Riwayat', icon: IconList, active: p => p.startsWith('/transaksi')},
]

const on = 'bg-brand/10 text-brand'
const off = 'text-slate-600 hover:bg-slate-100'

export default function AppLayout({onSignOut}: Props) {
  const {pathname} = useLocation()
  // Editor punya bar "Simpan" fixed di bawah sendiri; bottom nav disembunyikan agar tidak bertumpuk.
  const hideBottomNav = pathname === '/baru'
  const scanActive = pathname === '/scan' || pathname === '/verifikasi'

  return <div className="min-h-screen w-full overflow-x-hidden">
    {/* Desktop (lg): sidebar kiri tetap */}
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-slate-200 bg-white p-4">
      <p className="px-3 py-2 text-xl font-extrabold tracking-tight text-brand min-w-0 truncate">Smart Split Bill</p>
      <nav aria-label="Menu utama" className="mt-4 flex flex-col gap-1">
        <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}
          className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ${pathname === '/' ? on : off}`}>
          <IconHome className="h-5 w-5 shrink-0"/><span className="min-w-0 truncate">Dashboard</span></Link>
        <Link to="/scan" onClick={clearAll} aria-current={scanActive ? 'page' : undefined}
          className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ${scanActive ? on : off}`}>
          <IconScan className="h-5 w-5 shrink-0"/><span className="min-w-0 truncate">Scan Struk</span></Link>
        <Link to="/" aria-current={pathname.startsWith('/transaksi') ? 'page' : undefined}
          className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ${pathname.startsWith('/transaksi') ? on : off}`}>
          <IconList className="h-5 w-5 shrink-0"/><span className="min-w-0 truncate">Riwayat</span></Link>
      </nav>
      <button type="button" onClick={onSignOut}
        className="mt-auto flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 font-semibold text-slate-600 hover:bg-slate-100">
        <IconOut className="h-5 w-5 shrink-0"/><span className="min-w-0 truncate">Keluar</span></button>
    </aside>

    {/* Tablet (md sampai < lg): top navbar ringkas + aksi cepat */}
    <header className="hidden md:block lg:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        <p className="min-w-0 truncate font-extrabold tracking-tight text-brand">Smart Split Bill</p>
        <nav aria-label="Menu utama" className="ml-2 flex items-center gap-1">
          {NAV.map(i => <Link key={i.label} to={i.to} aria-current={i.active(pathname) ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${i.active(pathname) ? on : off}`}>{i.label}</Link>)}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link to="/baru" onClick={clearAll} className="rounded-lg border border-brand px-3 py-1.5 text-sm font-bold text-brand">Isi manual</Link>
          <Link to="/scan" onClick={clearAll} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-dark">Scan Struk</Link>
          <button type="button" onClick={onSignOut} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Keluar</button>
        </div>
      </div>
    </header>

    {/* Konten: pb-24 di mobile agar tidak tertutup bottom nav */}
    <div className="min-w-0 pb-24 md:pb-0 lg:pl-64">
      <div className="mx-auto w-full min-w-0 max-w-7xl"><Outlet/></div>
    </div>

    {/* Mobile (< md): bottom navigation, tombol utama Scan Struk di tengah */}
    {!hideBottomNav && <nav aria-label="Menu utama" className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16 grid-cols-5 items-center">
        <MobileLink to="/" label="Dashboard" active={pathname === '/'}><IconHome className="h-6 w-6"/></MobileLink>
        <MobileLink to="/" label="Riwayat" active={pathname.startsWith('/transaksi')}><IconList className="h-6 w-6"/></MobileLink>
        <Link to="/scan" onClick={clearAll} aria-label="Scan Struk" aria-current={scanActive ? 'page' : undefined}
          className="mx-auto -mt-6 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-brand text-white shadow-lg ring-4 ring-white hover:bg-brand-dark">
          <IconScan className="h-6 w-6"/></Link>
        <MobileLink to="/baru" label="Manual" active={pathname === '/baru'} onClick={clearAll}><IconEdit className="h-6 w-6"/></MobileLink>
        <button type="button" onClick={onSignOut} className="flex min-w-0 flex-col items-center gap-0.5 px-1 text-slate-600">
          <IconOut className="h-6 w-6"/><span className="max-w-full min-w-0 truncate text-[11px] font-semibold">Keluar</span></button>
      </div>
    </nav>}
  </div>
}

function MobileLink({to,label,active,children,onClick}: {to: string; label: string; active: boolean; children: ReactNode; onClick?: () => void}) {
  return <Link to={to} onClick={onClick} aria-current={active ? 'page' : undefined}
    className={`flex min-w-0 flex-col items-center gap-0.5 px-1 ${active ? 'text-brand' : 'text-slate-600'}`}>
    {children}<span className="max-w-full min-w-0 truncate text-[11px] font-semibold">{label}</span></Link>
}
