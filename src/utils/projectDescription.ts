// Helpers for serializing/deserializing UI metadata (Developer, RERA,
// website, maps_url, PAN, GST) packed inside the projects.description
// column -- avoids a schema migration for fields that are purely
// display/document metadata, not queried on directly.
export interface ProjectDescriptionJSON {
  developer: string;
  rera: string;
  website: string;
  maps_url: string;
  pan: string;
  gst: string;
  text: string;
}

export const parseDescription = (descStr: string | null): ProjectDescriptionJSON => {
  if (!descStr) {
    return { developer: '', rera: '', website: '', maps_url: '', pan: '', gst: '', text: '' };
  }
  try {
    const trimmed = descStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      return {
        developer: parsed.developer || '',
        rera: parsed.rera || '',
        website: parsed.website || '',
        maps_url: parsed.maps_url || '',
        pan: parsed.pan || '',
        gst: parsed.gst || '',
        text: parsed.text || ''
      };
    }
  } catch (err) {
    // Plain text fallback
  }
  return { developer: '', rera: '', website: '', maps_url: '', pan: '', gst: '', text: descStr };
};

export const serializeDescription = (developer: string, rera: string, website: string, maps_url: string, pan: string, gst: string, text: string): string => {
  return JSON.stringify({ developer, rera, website, maps_url, pan, gst, text });
};
