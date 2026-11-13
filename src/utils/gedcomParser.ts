import { FamilyTreeData, Person, Gender } from '../types/tree';
import { autoArrangeTree } from './autoLayout';

/**
 * Parses birth/death dates from GEDCOM date strings (e.g., "15 MAY 1945", "ABT 1920", "1952")
 */
function parseGedcomDate(rawDate?: string): {
  dateStr?: string;
  day?: string;
  month?: string;
  year?: string;
} {
  if (!rawDate || !rawDate.trim()) return {};
  const clean = rawDate.trim();
  const parts = clean.split(/\s+/);

  let day: string | undefined = undefined;
  let month: string | undefined = undefined;
  let year: string | undefined = undefined;

  const yearMatch = clean.match(/\b(1\d{3}|20\d{2})\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  const monthsMap: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    'СІЧ': '01', 'ЛЮТ': '02', 'БЕР': '03', 'КВІ': '04', 'ТРА': '05', 'ЧЕР': '06',
    'ЛИП': '07', 'СЕР': '08', 'ВЕР': '09', 'ЖОВ': '10', 'ЛИС': '11', 'ГРУ': '12'
  };

  for (const part of parts) {
    const upper = part.toUpperCase();
    if (monthsMap[upper]) {
      month = monthsMap[upper];
    } else if (!day && /^\d{1,2}$/.test(part) && parseInt(part, 10) <= 31) {
      day = part.padStart(2, '0');
    }
  }

  return {
    dateStr: clean,
    day,
    month,
    year,
  };
}

/**
 * Robust GEDCOM 5.5 / 5.5.1 parser that converts .ged/.gedcom standard files into FamilyTreeData
 */
export function parseGedcomText(gedcomText: string, filename?: string): FamilyTreeData {
  const lines = gedcomText.split(/\r?\n/);

  interface RawIndi {
    id: string;
    firstName: string;
    lastName: string;
    maidenName?: string;
    gender: Gender;
    birthDate?: string;
    birthDay?: string;
    birthMonth?: string;
    birthYear?: string;
    birthPlace?: string;
    deathDate?: string;
    deathDay?: string;
    deathMonth?: string;
    deathYear?: string;
    deathPlace?: string;
    deathCause?: string;
    isDeceased?: boolean;
    residencePlace?: string;
    profession?: string;
    education?: string;
    notes?: string;
    parents: Set<string>;
    spouses: Set<string>;
    children: Set<string>;
  }

  interface RawFam {
    id: string;
    husbandId?: string;
    wifeId?: string;
    childrenIds: string[];
    marrDate?: string;
    marrPlace?: string;
  }

  const indis: Record<string, RawIndi> = {};
  const fams: Record<string, RawFam> = {};

  let currentType: 'INDI' | 'FAM' | null = null;
  let currentIndi: RawIndi | null = null;
  let currentFam: RawFam | null = null;
  let activeEvent: 'BIRT' | 'DEAT' | 'MARR' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match 0 @ID@ TYPE or 1 TAG VALUE or 2 TAG VALUE
    const match = trimmed.match(/^(\d+)\s+(@[^@]+@)?\s*([A-Za-z0-9_]+)?\s*(.*)$/);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    const id = match[2] ? match[2].replace(/@/g, '') : undefined;
    const tag = match[3] ? match[3].toUpperCase() : undefined;
    const value = match[4] ? match[4].trim() : '';

    if (level === 0) {
      activeEvent = null;
      if (tag === 'INDI' && id) {
        currentType = 'INDI';
        currentIndi = {
          id: `person_${id}`,
          firstName: '',
          lastName: '',
          gender: 'unknown',
          parents: new Set(),
          spouses: new Set(),
          children: new Set(),
        };
        indis[currentIndi.id] = currentIndi;
        currentFam = null;
      } else if (tag === 'FAM' && id) {
        currentType = 'FAM';
        currentFam = {
          id: `fam_${id}`,
          childrenIds: [],
        };
        fams[currentFam.id] = currentFam;
        currentIndi = null;
      } else {
        currentType = null;
        currentIndi = null;
        currentFam = null;
      }
      continue;
    }

    if (currentType === 'INDI' && currentIndi) {
      if (level === 1) {
        activeEvent = null;
        if (tag === 'NAME') {
          // GEDCOM names: "FirstName /LastName/"
          const nameParts = value.split('/');
          const gName = (nameParts[0] || '').trim();
          const sName = (nameParts[1] || '').trim();
          if (gName) currentIndi.firstName = gName;
          if (sName) currentIndi.lastName = sName;
          if (!currentIndi.firstName && !currentIndi.lastName) {
            currentIndi.firstName = value.replace(/\//g, '').trim() || 'Невідомо';
          }
        } else if (tag === 'GIVN' && !currentIndi.firstName) {
          currentIndi.firstName = value;
        } else if (tag === 'SURN' && !currentIndi.lastName) {
          currentIndi.lastName = value;
        } else if (tag === '_MARNM') {
          currentIndi.maidenName = value;
        } else if (tag === 'SEX') {
          const val = value.toUpperCase();
          if (val === 'M' || val === 'MALE') currentIndi.gender = 'male';
          else if (val === 'F' || val === 'FEMALE') currentIndi.gender = 'female';
        } else if (tag === 'BIRT') {
          activeEvent = 'BIRT';
        } else if (tag === 'DEAT') {
          activeEvent = 'DEAT';
          currentIndi.isDeceased = true;
        } else if (tag === 'OCCU') {
          currentIndi.profession = value;
        } else if (tag === 'EDUC') {
          currentIndi.education = value;
        } else if (tag === 'RESI') {
          currentIndi.residencePlace = value;
        } else if (tag === 'NOTE') {
          currentIndi.notes = (currentIndi.notes ? currentIndi.notes + '\n' : '') + value;
        }
      } else if (level === 2 && activeEvent) {
        if (tag === 'DATE') {
          const parsed = parseGedcomDate(value);
          if (activeEvent === 'BIRT') {
            currentIndi.birthDate = parsed.dateStr;
            currentIndi.birthDay = parsed.day;
            currentIndi.birthMonth = parsed.month;
            currentIndi.birthYear = parsed.year;
          } else if (activeEvent === 'DEAT') {
            currentIndi.deathDate = parsed.dateStr;
            currentIndi.deathDay = parsed.day;
            currentIndi.deathMonth = parsed.month;
            currentIndi.deathYear = parsed.year;
          }
        } else if (tag === 'PLAC') {
          if (activeEvent === 'BIRT') currentIndi.birthPlace = value;
          else if (activeEvent === 'DEAT') currentIndi.deathPlace = value;
        } else if (tag === 'CAUS' && activeEvent === 'DEAT') {
          currentIndi.deathCause = value;
        }
      }
    } else if (currentType === 'FAM' && currentFam) {
      if (level === 1) {
        activeEvent = null;
        if (tag === 'HUSB' && value) {
          const husbId = value.replace(/@/g, '');
          currentFam.husbandId = `person_${husbId}`;
        } else if (tag === 'WIFE' && value) {
          const wifeId = value.replace(/@/g, '');
          currentFam.wifeId = `person_${wifeId}`;
        } else if (tag === 'CHIL' && value) {
          const chilId = value.replace(/@/g, '');
          currentFam.childrenIds.push(`person_${chilId}`);
        } else if (tag === 'MARR') {
          activeEvent = 'MARR';
        }
      } else if (level === 2 && activeEvent === 'MARR') {
        if (tag === 'DATE') currentFam.marrDate = value;
        else if (tag === 'PLAC') currentFam.marrPlace = value;
      }
    }
  }

  // Cross-link family relationships
  const connectionOverrides: Record<string, any> = {};

  Object.values(fams).forEach((fam) => {
    const { husbandId, wifeId, childrenIds, marrDate, marrPlace } = fam;

    if (husbandId && wifeId && indis[husbandId] && indis[wifeId]) {
      indis[husbandId].spouses.add(wifeId);
      indis[wifeId].spouses.add(husbandId);

      // Record marriage event meta
      if (marrDate || marrPlace) {
        const connKey = `marriage:${husbandId}:${wifeId}`;
        connectionOverrides[connKey] = {
          verified: true,
          eventType: 'marriage',
          eventDate: marrDate,
          notes: marrPlace ? `Місце шлюбу: ${marrPlace}` : undefined,
        };
      }
    }

    childrenIds.forEach((childId) => {
      const child = indis[childId];
      if (!child) return;

      if (husbandId && indis[husbandId]) {
        child.parents.add(husbandId);
        indis[husbandId].children.add(childId);
      }
      if (wifeId && indis[wifeId]) {
        child.parents.add(wifeId);
        indis[wifeId].children.add(childId);
      }
    });
  });

  // Convert raw indis to final Person map
  const finalPersons: Record<string, Person> = {};
  Object.values(indis).forEach((ind) => {
    const p: Person = {
      id: ind.id,
      firstName: ind.firstName || 'Ім’я',
      lastName: ind.lastName || '',
      maidenName: ind.maidenName,
      gender: ind.gender,
      birthDate: ind.birthDate,
      birthDay: ind.birthDay,
      birthMonth: ind.birthMonth,
      birthYear: ind.birthYear,
      birthPlace: ind.birthPlace,
      deathDate: ind.deathDate,
      deathDay: ind.deathDay,
      deathMonth: ind.deathMonth,
      deathYear: ind.deathYear,
      deathPlace: ind.deathPlace,
      deathCause: ind.deathCause,
      isDeceased: ind.isDeceased,
      residencePlace: ind.residencePlace,
      profession: ind.profession,
      education: ind.education,
      notes: ind.notes,
      parents: Array.from(ind.parents),
      spouses: Array.from(ind.spouses),
      children: Array.from(ind.children),
      x: 0,
      y: 0,
    };
    finalPersons[p.id] = p;
  });

  // Run automatic tree layout to arrange cards neatly on canvas
  const arranged = autoArrangeTree(finalPersons, connectionOverrides);

  const cleanTitle = (filename || 'Імпортоване GEDCOM дерево')
    .replace(/\.(ged|gedcom|json|csv)$/i, '')
    .trim();

  return {
    id: `tree_${Date.now()}`,
    title: cleanTitle || 'Родове дерево',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    persons: arranged.persons,
    connectionOverrides,
  };
}

/**
 * Parses simple CSV formatted family data
 */
export function parseCsvText(csvText: string, filename?: string): FamilyTreeData {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV файл порожній або не містить колонок.');

  const headers = lines[0].toLowerCase().split(/[,;\t]/).map((h) => (h ? h.replace(/["']/g, '').trim() : ''));
  const fnIdx = headers.findIndex((h) => h && (h.includes('first') || h.includes('ім') || h.includes('name')));
  const lnIdx = headers.findIndex((h) => h && (h.includes('last') || h.includes('прізвищ') || h.includes('surname')));
  const genderIdx = headers.findIndex((h) => h && (h.includes('gender') || h.includes('стать') || h.includes('sex')));
  const birthIdx = headers.findIndex((h) => h && (h.includes('birth') || h.includes('народж')));

  const persons: Record<string, Person> = {};

  lines.slice(1).forEach((line, index) => {
    const cols = line.split(/[,;\t]/).map((c) => c.replace(/["']/g, '').trim());
    const firstName = fnIdx >= 0 ? cols[fnIdx] : cols[0] || `Особа ${index + 1}`;
    const lastName = lnIdx >= 0 ? cols[lnIdx] : (cols[1] || '');
    const genderRaw = genderIdx >= 0 ? cols[genderIdx]?.toLowerCase() : '';
    const birthDate = birthIdx >= 0 ? cols[birthIdx] : '';

    const gender: Gender = genderRaw.startsWith('ч') || genderRaw.startsWith('m')
      ? 'male'
      : genderRaw.startsWith('ж') || genderRaw.startsWith('f')
      ? 'female'
      : 'unknown';

    const pid = `person_csv_${index + 1}`;
    persons[pid] = {
      id: pid,
      firstName,
      lastName,
      gender,
      birthDate,
      parents: [],
      spouses: [],
      children: [],
      x: (index % 5) * 240 + 100,
      y: Math.floor(index / 5) * 180 + 100,
    };
  });

  const arranged = autoArrangeTree(persons);

  return {
    id: `tree_${Date.now()}`,
    title: (filename || 'Імпортоване CSV дерево').replace(/\.[^/.]+$/, ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    persons: arranged.persons,
  };
}
