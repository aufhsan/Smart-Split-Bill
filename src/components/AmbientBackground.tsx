/** Dekorasi latar lembut (blob gradasi) di belakang seluruh konten. Letakkan di dalam wrapper `relative isolate`. */
export default function AmbientBackground() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-teal-200/60 opacity-45 blur-3xl"/>
    <div className="absolute -right-24 top-1/4 h-[28rem] w-[28rem] rounded-full bg-emerald-100/70 opacity-45 blur-3xl"/>
    <div className="absolute -bottom-28 left-1/3 h-96 w-96 rounded-full bg-amber-100/50 opacity-45 blur-3xl"/>
  </div>
}
