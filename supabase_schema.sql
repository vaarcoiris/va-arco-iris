-- 1. Create a table to store the videos
CREATE TABLE public.videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    author_name TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    category TEXT DEFAULT 'Geral',
    thumbnail_url TEXT
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- 3. Create a policy that allows anyone to READ the videos (for our Dashboard)
CREATE POLICY "Allow public read access" ON public.videos
    FOR SELECT
    TO public
    USING (true);

-- 4. Create a policy that allows only authenticated users/service role to INSERT
-- (Our n8n will use the Service Role Key to insert, which bypasses RLS)
CREATE POLICY "Allow service role to insert" ON public.videos
    FOR INSERT
    TO service_role
    WITH CHECK (true);
