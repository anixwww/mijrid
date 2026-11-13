import { FamilyTreeData } from '../types/tree';

function exportToGedcom(tree: FamilyTreeData): string {
  const persons = Object.values(tree.persons || {});
  if (persons.length === 0) return '';

  const lines: string[] = [];
  const personIdToGedcomId = new Map<string, string>();

  // Map each person ID to a GEDCOM INDI ID (e.g. @I1@)
  persons.forEach((p, idx) => {
    personIdToGedcomId.set(p.id, `I${idx + 1}`);
  });

  // Track family connections: pairs of spouses and their children, or single parents
  interface GedcomFamily {
    id: string;
    husbandId?: string;
    wifeId?: string;
    childrenIds: string[];
    marrDate?: string;
    marrPlace?: string;
  }

  const families: GedcomFamily[] = [];
  const processedSpousePairs = new Set<string>();
  const personChildOfFam = new Map<string, string>(); // personId -> FAM ID
  const personSpouseOfFams = new Map<string, string[]>(); // personId -> FAM IDs

  // 1. Spousal families
  persons.forEach((p) => {
    (p.spouses || []).forEach((sId) => {
      const spouse = tree.persons[sId];
      if (!spouse) return;
      const pairKey = [p.id, sId].sort().join('::');
      if (processedSpousePairs.has(pairKey)) return;
      processedSpousePairs.add(pairKey);

      const husband = p.gender === 'male' ? p : spouse.gender === 'male' ? spouse : p;
      const wife = p.gender === 'female' ? p : spouse.gender === 'female' ? spouse : spouse;

      const children = persons.filter(
        (child) =>
          child.parents?.includes(husband.id) && child.parents?.includes(wife.id)
      );

      const famId = `F${families.length + 1}`;
      const childGedcomIds: string[] = [];

      children.forEach((c) => {
        const cGedId = personIdToGedcomId.get(c.id);
        if (cGedId) {
          childGedcomIds.push(cGedId);
          personChildOfFam.set(c.id, famId);
        }
      });

      const hGedId = personIdToGedcomId.get(husband.id);
      const wGedId = personIdToGedcomId.get(wife.id);

      if (hGedId) {
        const cur = personSpouseOfFams.get(husband.id) || [];
        cur.push(famId);
        personSpouseOfFams.set(husband.id, cur);
      }
      if (wGedId) {
        const cur = personSpouseOfFams.get(wife.id) || [];
        cur.push(famId);
        personSpouseOfFams.set(wife.id, cur);
      }

      families.push({
        id: famId,
        husbandId: hGedId,
        wifeId: wGedId,
        childrenIds: childGedcomIds,
      });
    });
  });

  // 2. Single parent families (children that belong to only one parent in tree)
  persons.forEach((parent) => {
    const singleParentChildren = persons.filter(
      (c) =>
        c.parents?.includes(parent.id) &&
        !personChildOfFam.has(c.id) &&
        (!c.parents || c.parents.length === 1 || !c.parents.some((pid) => pid !== parent.id && tree.persons[pid]))
    );

    if (singleParentChildren.length > 0) {
      const famId = `F${families.length + 1}`;
      const childGedcomIds: string[] = [];

      singleParentChildren.forEach((c) => {
        const cGedId = personIdToGedcomId.get(c.id);
        if (cGedId) {
          childGedcomIds.push(cGedId);
          personChildOfFam.set(c.id, famId);
        }
      });

      const parentGedId = personIdToGedcomId.get(parent.id);
      if (parentGedId) {
        const cur = personSpouseOfFams.get(parent.id) || [];
        cur.push(famId);
        personSpouseOfFams.set(parent.id, cur);
      }

      families.push({
        id: famId,
        husbandId: parent.gender === 'male' ? parentGedId : undefined,
        wifeId: parent.gender === 'female' ? parentGedId : undefined,
        childrenIds: childGedcomIds,
      });
    }
  });

  // --- GEDCOM Output Assembly ---
  // Header
  lines.push('0 HEAD');
  lines.push('1 SOUR Rodovid Family Tree');
  lines.push('2 NAME Rodovid Genealogical Editor');
  lines.push('2 CORP Rodovid');
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');
  lines.push('1 LANG Ukrainian');

  // Individuals
  persons.forEach((p) => {
    const indiId = personIdToGedcomId.get(p.id);
    if (!indiId) return;

    lines.push(`0 @${indiId}@ INDI`);

    // Name
    const firstName = p.firstName || '';
    const lastName = p.lastName || '';
    lines.push(`1 NAME ${firstName} /${lastName}/`);
    if (firstName) lines.push(`2 GIVN ${firstName}`);
    if (lastName) lines.push(`2 SURN ${lastName}`);
    if (p.maidenName) {
      lines.push(`2 _MARNM ${p.maidenName}`);
    }
    if (p.nickname) {
      lines.push(`2 NICK ${p.nickname}`);
    }

    // Gender
    const sex = p.gender === 'male' ? 'M' : p.gender === 'female' ? 'F' : 'U';
    lines.push(`1 SEX ${sex}`);

    // Birth
    if (p.birthDate || p.birthYear || p.birthPlace) {
      lines.push('1 BIRT');
      if (p.birthDate) {
        lines.push(`2 DATE ${p.birthDate}`);
      } else if (p.birthYear) {
        lines.push(`2 DATE ${p.birthYear}`);
      }
      if (p.birthPlace) {
        lines.push(`2 PLAC ${p.birthPlace}`);
      }
    }

    // Death (1 DEAT standard tag)
    if (p.isDeceased || p.deathDate || p.deathYear || p.deathPlace) {
      lines.push('1 DEAT');
      if (p.deathDate) {
        lines.push(`2 DATE ${p.deathDate}`);
      } else if (p.deathYear) {
        lines.push(`2 DATE ${p.deathYear}`);
      }
      if (p.deathPlace) {
        lines.push(`2 PLAC ${p.deathPlace}`);
      }
      if (p.deathCause) {
        lines.push(`2 CAUS ${p.deathCause}`);
      }
    }

    // Burial
    if (p.burialPlace) {
      lines.push('1 BURI');
      lines.push(`2 PLAC ${p.burialPlace}`);
    }

    // Residence
    if (p.residencePlace) {
      lines.push('1 RESI');
      lines.push(`2 PLAC ${p.residencePlace}`);
    }

    // Profession
    if (p.profession) {
      lines.push(`1 OCCU ${p.profession}`);
    }

    // Notes
    if (p.notes) {
      const cleanNote = p.notes.replace(/\r?\n/g, ' ').trim();
      if (cleanNote) {
        lines.push(`1 NOTE ${cleanNote}`);
      }
    }

    // Family links
    const famc = personChildOfFam.get(p.id);
    if (famc) {
      lines.push(`1 FAMC @${famc}@`);
    }
    const fams = personSpouseOfFams.get(p.id) || [];
    fams.forEach((fId) => {
      lines.push(`1 FAMS @${fId}@`);
    });
  });

  // Families
  families.forEach((fam) => {
    lines.push(`0 @${fam.id}@ FAM`);
    if (fam.husbandId) {
      lines.push(`1 HUSB @${fam.husbandId}@`);
    }
    if (fam.wifeId) {
      lines.push(`1 WIFE @${fam.wifeId}@`);
    }
    fam.childrenIds.forEach((cId) => {
      lines.push(`1 CHIL @${cId}@`);
    });
  });

  // Trailer
  lines.push('0 TRLR');

  return lines.join('\n');
}

export function downloadGedcomFile(tree: FamilyTreeData) {
  const content = exportToGedcom(tree);
  if (!content) return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const titleClean = (tree.title || 'family_tree').toLowerCase().replace(/\s+/g, '_');
  link.download = `${titleClean}.ged`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
