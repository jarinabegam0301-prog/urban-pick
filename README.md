# URBAN Pick

The storefront and admin portal are a Next.js app. Supabase provides PostgreSQL, admin authentication, and public product-image storage; there is no separate API server.

## Configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](./supabase/schema.sql), and run it once. This creates the tables, initial categories, stock/sales transactions, security policies, public catalog views, and the `product-images` Storage bucket.
3. In Supabase **Authentication → Users**, create the admin user with a temporary password. Disable public sign-ups so visitors cannot create accounts.
4. Copy the new user's UUID from the Users page and add its admin profile in the SQL Editor:

   ```sql
   INSERT INTO public.admins (id, name, email)
   VALUES ('AUTH_USER_UUID', 'Store Admin', 'admin@example.com');
   ```

   The UUID must belong to the Supabase Auth user you just created. Admin permissions are checked in PostgreSQL; hiding the admin screens in the browser is not the security boundary.
5. Set the WhatsApp number used by the storefront (country code and digits, no `+`):

   ```sql
   UPDATE public.app_settings
   SET value = '919876543210'
   WHERE key = 'whatsapp_number';
   ```

6. In Supabase **Project Settings → API**, copy the project URL and the publishable/anon key. Do not use the `service_role` key in this app.

## Run locally

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, then open [http://localhost:3000](http://localhost:3000). The same Supabase client is used for local and hosted use; there is no Python server to start.

## Deploy

Deploy the Next.js app to your preferred Next.js host and set the same two `NEXT_PUBLIC_SUPABASE_*` environment variables there. Add the hosted site URL to Supabase Auth's allowed redirect URLs. Product images uploaded from the admin portal go to the public `product-images` bucket; uploads are limited to JPG, PNG, or WebP files up to 5 MB.

## Existing data

The SQL setup creates an empty Supabase database with the same product, category, inventory, stock-history, sales, dashboard, and settings features. It does not copy rows or custom password hashes from an existing PostgreSQL database. Create Supabase Auth users for admins and import any existing catalog/sales records into the new project before switching production traffic.

Previously uploaded local images are kept under `public/uploads` so existing `/uploads/...` product image URLs still work after the Python service is removed. New uploads use Supabase Storage.
