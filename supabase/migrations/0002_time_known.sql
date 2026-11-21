-- Jam transaksi dari struk bisa tidak ada: false = hanya tanggal yang diketahui (jam disimpan 00:00 WIB tetapi tidak ditampilkan).
alter table public.transactions add column if not exists time_known boolean not null default true;
