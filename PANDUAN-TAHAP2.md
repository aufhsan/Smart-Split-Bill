# Deploy Edge Function OCR (Gemini)
1. Instal CLI dan login: `npm i -g supabase` lalu `supabase login`
2. Dari folder proyek: `supabase link --project-ref <PROJECT_REF>` (ada di URL dashboard Supabase)
3. Simpan key (hanya di server, jangan di `.env` berawalan VITE_):
   `supabase secrets set GEMINI_API_KEY=isi_key_anda`
   Opsional ganti model: `supabase secrets set GEMINI_MODEL=nama-model`
4. Deploy: `supabase functions deploy ocr-receipt` (verifikasi JWT tetap aktif, hanya pengguna login yang bisa memanggil)
5. `npm install` (menambah browser-image-compression), lalu `npm run dev`.
Cek log jika gagal: Supabase > Edge Functions > ocr-receipt > Logs.
Alur: Dashboard > Scan struk > Periksa hasil scan > Editor (pembagian) > Simpan.

## Model Gemini berubah / tidak tersedia
Fungsi mencoba berurutan: `GEMINI_MODEL` (jika diset) -> gemini-3.8-flash -> gemini-3.8-flash-lite -> gemini-2.5-pro,
dengan retry otomatis pada 503/429. Untuk mengganti model tanpa ubah kode:
`supabase secrets set GEMINI_MODEL=nama-model` lalu `supabase functions deploy ocr-receipt`.
