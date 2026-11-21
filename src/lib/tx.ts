import {supabase} from './supabase'
/** Hapus transaksi beserta turunannya (ON DELETE CASCADE) dan foto struk di Storage. */
export async function deleteTransaction(id:string) {
  const {data:rc} = await supabase.from('receipts').select('storage_path').eq('transaction_id', id)   // ambil dulu: barisnya ikut terhapus oleh cascade
  const {data, error} = await supabase.from('transactions').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Transaksi tidak ditemukan atau Anda tidak punya akses untuk menghapusnya.')   // RLS menolak diam-diam = 0 baris
  const paths = (rc ?? []).map((r:{storage_path:string}) => r.storage_path)
  if (paths.length) await supabase.storage.from('receipts').remove(paths).catch(() => {})                      // foto gagal terhapus tidak membatalkan hasil
}
export const confirmDelete = (name:string|null) =>
  window.confirm(`Yakin ingin menghapus transaksi ini?\n\n${name || 'Tanpa nama tempat'}\n\nSemua rincian pembagian, catatan pembayaran, dan foto struk ikut terhapus. Tindakan ini tidak bisa dibatalkan.`)
