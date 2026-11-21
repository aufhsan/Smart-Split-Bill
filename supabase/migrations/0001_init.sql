-- Smart Split Bill: skema Tahap 1 (8 komponen sesuai dokumen)
create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, created_at timestamptz not null default now());

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  merchant text, transacted_at timestamptz not null default now(),
  receipt_total bigint,            -- total tercetak di struk (opsional)
  subtotal bigint not null default 0, total bigint not null default 0,
  created_at timestamptz not null default now());
create index on public.transactions(user_id, transacted_at desc);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  name text not null, position int not null default 0);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  name text not null, total_price bigint not null check (total_price >= 0),
  quantity int not null default 1);

create table public.item_assignments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  qty int not null check (qty > 0), unique (item_id, participant_id));

create table public.additional_costs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  kind text not null check (kind in ('tax','service','discount','other')),
  name text not null, percent numeric,           -- null jika hanya nominal
  printed_amount bigint,                         -- nominal tercetak di struk
  computed_amount bigint not null default 0,     -- nominal yang dipakai sistem
  method text not null default 'proportional' check (method in ('equal','proportional','manual')));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  amount bigint not null check (amount > 0), paid_at timestamptz not null default now(), note text);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  storage_path text not null, created_at timestamptz not null default now());

-- Profil otomatis saat daftar
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.users(id,email) values (new.id,new.email) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: hanya pemilik transaksi
create function public.owns_tx(tx uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.transactions t where t.id = tx and t.user_id = auth.uid()) $$;

alter table public.users enable row level security;
create policy "own profile" on public.users for all using (id = auth.uid()) with check (id = auth.uid());
alter table public.transactions enable row level security;
create policy "own tx" on public.transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['participants','items','item_assignments','additional_costs','payments','receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (public.owns_tx(transaction_id)) with check (public.owns_tx(transaction_id))', t);
  end loop; end $$;

-- Storage: bucket privat, file di folder <user_id>/...
insert into storage.buckets (id, name, public) values ('receipts','receipts',false) on conflict do nothing;
create policy "receipts own read"   on storage.objects for select using (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "receipts own insert" on storage.objects for insert with check (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "receipts own delete" on storage.objects for delete using (bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
