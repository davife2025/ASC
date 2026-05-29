-- Enable Supabase Realtime on incidents and investigations
-- Run in Supabase SQL editor or via supabase db push

alter publication supabase_realtime add table incidents;
alter publication supabase_realtime add table investigations;
