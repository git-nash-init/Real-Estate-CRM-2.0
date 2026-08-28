-- RLS Policies for whatsapp_session
-- Ensure users can only read and update their own WhatsApp session

ALTER TABLE whatsapp_session ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to insert their own session
DROP POLICY IF EXISTS "Users can create their own whatsapp session" ON whatsapp_session;
CREATE POLICY "Users can create their own whatsapp session"
ON whatsapp_session FOR INSERT TO authenticated
WITH CHECK (id = auth.uid()::text);

-- Allow all authenticated users to read their own session
DROP POLICY IF EXISTS "Users can view their own whatsapp session" ON whatsapp_session;
CREATE POLICY "Users can view their own whatsapp session"
ON whatsapp_session FOR SELECT TO authenticated
USING (id = auth.uid()::text);

-- Allow all authenticated users to update their own session (e.g. pending_command)
DROP POLICY IF EXISTS "Users can update their own whatsapp session" ON whatsapp_session;
CREATE POLICY "Users can update their own whatsapp session"
ON whatsapp_session FOR UPDATE TO authenticated
USING (id = auth.uid()::text)
WITH CHECK (id = auth.uid()::text);

-- RLS Policies for whatsapp_outbox
-- Ensure that created_by is set correctly and users can only view their own messages if needed,
-- but the system might need to send messages on their behalf.
-- We'll just ensure created_by defaults to auth.uid() if not provided.
ALTER TABLE whatsapp_outbox ALTER COLUMN created_by SET DEFAULT auth.uid();
