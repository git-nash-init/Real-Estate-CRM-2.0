import { supabase } from './supabaseClient';

/**
 * Shared upload helper for WhatsApp attachments, used by both the
 * per-lead send (Leads.tsx) and bulk campaigns (Marketing.tsx).
 *
 * Files go to the private `whatsapp-attachments` Storage bucket; only the
 * resulting path + metadata are written to whatsapp_outbox. The gateway
 * mints a short-lived signed URL at send time, so attachments are never
 * publicly readable.
 */

export const ATTACHMENT_BUCKET = 'whatsapp-attachments';

/** WhatsApp itself rejects media over ~16MB, so reject it here with a clear message. */
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

export interface UploadedAttachment {
  path: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  sizeBytes: number;
}

/**
 * Maps a browser MIME type to the message kind the gateway will send.
 * Anything unrecognised is sent as a document, which is the safe default —
 * WhatsApp will still deliver it with its original filename.
 */
export const mediaKindFor = (mimeType: string): UploadedAttachment['type'] => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Uploads one file and returns what the caller needs to write onto the
 * outbox row. Throws with a human-readable message on failure so call
 * sites can surface it directly.
 */
export const uploadWhatsAppAttachment = async (file: File): Promise<UploadedAttachment> => {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)}. WhatsApp will not accept attachments over ${formatBytes(MAX_ATTACHMENT_BYTES)}.`
    );
  }
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty.`);
  }

  // Randomised path segment so two people uploading "brochure.pdf" on the
  // same day can't collide or overwrite each other's file.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (error) {
    // The bucket restricts allowed MIME types; make that failure legible
    // rather than surfacing the raw storage error.
    if (/mime type/i.test(error.message)) {
      throw new Error(`"${file.name}" is a file type WhatsApp attachments don't support.`);
    }
    throw new Error(`Could not upload "${file.name}": ${error.message}`);
  }

  return {
    path,
    type: mediaKindFor(file.type || ''),
    filename: file.name,
    sizeBytes: file.size,
  };
};

/** Best-effort cleanup when a user removes an attachment before sending. */
export const removeWhatsAppAttachment = async (path: string): Promise<void> => {
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
};
