import { Person } from '../types/tree';
import { authHeaders } from './auth';
import { formatPersonLifeDates, formatSingleDate } from './dateUtils';

export interface AiBiographyPayload {
  fullName: string;
  patronymic?: string;
  maidenName?: string;
  nickname?: string;
  clanName?: string;
  gender?: string;
  birthInfo?: string;
  deathInfo?: string;
  isDeceased?: boolean;
  birthPlace?: string;
  residencePlace?: string;
  migrationNotes?: string;
  deathPlace?: string;
  burialPlace?: string;
  deathCause?: string;
  education?: string;
  profession?: string;
  workplaceNotes?: string;
  midwife?: string;
  godparents?: string;
  houseNumber?: string;
  notes?: string;
  interestingStories?: string;
  ghostNote?: string;
  existingBiography?: string;
  parents: string[];
  spouses: string[];
  children: string[];
  siblings: string[];
  approvedMemories: string[];
  documents: string[];
}

function formatRelativeLabel(rel: Person | undefined): string | null {
  if (!rel) return null;
  const name = [rel.firstName, rel.lastName].filter(Boolean).join(' ').trim();
  if (!name || name === '?') return null;
  const dates = formatPersonLifeDates(rel);
  return dates ? `${name} (${dates})` : name;
}

export function buildPersonBiographyPayload(
  person: Person,
  allPersons: Record<string, Person>
): AiBiographyPayload {
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();

  const exactBirth =
    formatSingleDate(person.birthDay, person.birthMonth, person.birthYear, '.') ||
    person.birthDate?.trim() ||
    '';
  const approxPrefix = person.birthDateType === 'about' || person.isBirthDateApproximate ? 'близько ' : '';
  const birthInfo =
    person.birthDateType === 'period' && person.birthYear && person.birthYearEnd
      ? `${person.birthYear}–${person.birthYearEnd}`
      : exactBirth
      ? `${approxPrefix}${exactBirth}`
      : person.yearsDisplay?.trim() || '';

  const exactDeath =
    formatSingleDate(person.deathDay, person.deathMonth, person.deathYear, '.') ||
    person.deathDate?.trim() ||
    '';

  const resolveRelatives = (ids: string[] | undefined): string[] => {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    for (const id of ids) {
      const label = formatRelativeLabel(allPersons[id]);
      if (label && !out.includes(label)) out.push(label);
    }
    return out;
  };

  const approvedMemories = (person.guestSuggestions || [])
    .filter((s) => s.status === 'approved' && s.message?.trim())
    .map((s) => {
      const author = s.authorName ? ` (${s.authorName})` : '';
      return `${s.message.trim()}${author}`;
    });

  const documents: string[] = [];
  (person.metricDocuments || []).forEach((doc) => {
    const parts = [doc.title?.trim(), doc.date?.trim()].filter(Boolean);
    if (parts.length > 0) documents.push(parts.join(' — '));
  });
  (person.photoAlbum || []).forEach((photo) => {
    const parts = [photo.title?.trim() || photo.caption?.trim(), photo.date?.trim(), photo.notes?.trim()].filter(Boolean);
    if (parts.length > 0) documents.push(parts.join(' — '));
  });

  return {
    fullName,
    patronymic: person.patronymic?.trim() || undefined,
    maidenName: person.maidenName?.trim() || undefined,
    nickname: person.nickname?.trim() || undefined,
    clanName: person.clanName?.trim() || undefined,
    gender: person.gender,
    birthInfo: birthInfo || undefined,
    deathInfo: exactDeath || undefined,
    isDeceased: Boolean(person.isDeceased),
    birthPlace: person.birthPlace?.trim() || undefined,
    residencePlace: person.residencePlace?.trim() || undefined,
    migrationNotes: person.migrationNotes?.trim() || undefined,
    deathPlace: person.deathPlace?.trim() || undefined,
    burialPlace: person.burialPlace?.trim() || undefined,
    deathCause: person.deathCause?.trim() || undefined,
    education: person.education?.trim() || undefined,
    profession: person.profession?.trim() || undefined,
    workplaceNotes: person.workplaceNotes?.trim() || undefined,
    midwife: person.midwife?.trim() || undefined,
    godparents: person.godparents?.trim() || undefined,
    houseNumber: person.houseNumber?.trim() || undefined,
    notes: person.notes?.trim() || undefined,
    interestingStories: person.interestingStories?.trim() || undefined,
    ghostNote: person.ghostNote?.trim() || undefined,
    existingBiography: person.biography?.trim() || undefined,
    parents: resolveRelatives(person.parents),
    spouses: resolveRelatives(person.spouses),
    children: resolveRelatives(person.children),
    siblings: resolveRelatives(person.siblings),
    approvedMemories,
    documents,
  };
}

export async function requestAiBiography(
  person: Person,
  allPersons: Record<string, Person>
): Promise<string> {
  const personData = buildPersonBiographyPayload(person, allPersons);

  const res = await fetch('/api/ai/generate-biography', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ personData }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || typeof data?.biography !== 'string') {
    throw new Error(
      data?.error || `Помилка сервера (${res.status}) під час створення біографії AI`
    );
  }

  return data.biography;
}
