-- Remove YYC Reel bucket-level size restrictions for videos and thumbnails.
-- Project-wide Supabase Storage limits still apply and depend on the subscription plan.
update storage.buckets
set file_size_limit = null
where id = 'yyc-reels';
