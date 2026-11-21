# Smart Split Bill — Tahap 1
1. `npm install`
2. Salin `.env.example` ke `.env`, isi URL dan anon key Supabase.
3. Supabase > SQL Editor: jalankan `supabase/migrations/0001_init.sql`.
4. Supabase > Authentication > Providers > Email: matikan "Confirm email" (MVP).
5. `npm test` (mesin perhitungan) lalu `npm run dev` (HTTPS wajib untuk kamera di Tahap 3).
