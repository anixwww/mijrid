import { MetricDocument, Person } from '../types/tree';

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|svg|ico|heic|heif)(\?.*)?$/i;

/**
 * Returns true if the MetricDocument or URL represents an external archive webpage link
 * (e.g. FamilySearch) rather than an uploaded image screenshot.
 */
export function isExternalMetricLink(urlOrDoc?: string | MetricDocument | null): boolean {
  if (!urlOrDoc) return false;
  if (typeof urlOrDoc === 'object') {
    if (urlOrDoc.kind === 'link') return true;
    if (urlOrDoc.kind === 'image') return false;
    return isExternalMetricLink(urlOrDoc.url);
  }
  const trimmed = urlOrDoc.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('data:image/')) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    return !IMAGE_EXT_RE.test(trimmed);
  }
  return false;
}

/**
 * Normalizes a user-pasted URL (adds https:// if omitted) and validates it.
 */
export function normalizeExternalMetricUrl(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getMetricLinkDomainLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('familysearch.org')) return 'FamilySearch';
    if (host.includes('babyn-yar') || host.includes('archives.gov.ua')) return 'Архів';
    return host;
  } catch {
    return 'Посилання';
  }
}

export function getDefaultMetricLinkTitle(url: string, type: 'birth' | 'death' | 'other' | 'marriage' | 'children'): string {
  const domain = getMetricLinkDomainLabel(url);
  const kindLabel =
    type === 'birth'
      ? 'Народження'
      : type === 'death'
      ? 'Смерть'
      : type === 'marriage'
      ? 'Шлюб'
      : type === 'children'
      ? 'Діти'
      : 'Метрика';
  return domain !== 'Посилання' ? `${domain} — ${kindLabel}` : `Посилання (${kindLabel})`;
}

/**
 * Returns the primary external webpage link (e.g. FamilySearch) for a person's birth or death metric, if any.
 */
export function getPrimaryMetricExternalLink(
  person: Person | null | undefined,
  tab: 'birth' | 'death'
): string | null {
  if (!person) return null;
  const directUrl = tab === 'birth' ? person.birthMetricUrl : person.deathMetricUrl;
  const matchingDocs = (person.metricDocuments || []).filter((d) => d.type === tab && d.url);
  const linkDoc = matchingDocs.find((d) => isExternalMetricLink(d));
  if (linkDoc) return linkDoc.url.trim();
  if (directUrl && isExternalMetricLink(directUrl)) return directUrl.trim();
  return null;
}
