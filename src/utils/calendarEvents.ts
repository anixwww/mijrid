import { Person } from '../types/tree';
import { parseDateString, MONTH_NAMES_GENITIVE } from './dateUtils';

export { MONTH_NAMES_GENITIVE };

export type EventType = 'birth' | 'death';

export interface CalendarEventItem {
  person: Person;
  type: EventType;
  day: number;
  month: number;
  year?: number;
  dateStr: string;
  ageOrYearsAgo?: number;
  daysUntil: number;
}

export function extractCalendarEvents(allPersons: Record<string, Person>): CalendarEventItem[] {
  const list: CalendarEventItem[] = [];
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  Object.values(allPersons).forEach((person) => {
    const bDay = person.birthDay || parseDateString(person.birthDate).day;
    const bMonth = person.birthMonth || parseDateString(person.birthDate).month;
    const bYear = person.birthYear || parseDateString(person.birthDate).year;

    if (bDay && bMonth) {
      const dNum = parseInt(bDay, 10);
      const mNum = parseInt(bMonth, 10);
      const yNum = bYear ? parseInt(bYear, 10) : undefined;

      if (!isNaN(dNum) && !isNaN(mNum) && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        const thisYearEvent = new Date(currentYear, mNum - 1, dNum);
        const todayMidnight = new Date(currentYear, currentMonth - 1, currentDay);
        let diffMs = thisYearEvent.getTime() - todayMidnight.getTime();
        if (diffMs < 0) {
          const nextYearEvent = new Date(currentYear + 1, mNum - 1, dNum);
          diffMs = nextYearEvent.getTime() - todayMidnight.getTime();
        }
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const ageOrYearsAgo = yNum ? currentYear - yNum : undefined;

        list.push({
          person,
          type: 'birth',
          day: dNum,
          month: mNum,
          year: yNum,
          dateStr: `${dNum} ${MONTH_NAMES_GENITIVE[mNum]}${yNum ? ` ${yNum} р.` : ''}`,
          ageOrYearsAgo,
          daysUntil,
        });
      }
    }

    const dDay = person.deathDay || parseDateString(person.deathDate).day;
    const dMonth = person.deathMonth || parseDateString(person.deathDate).month;
    const dYear = person.deathYear || parseDateString(person.deathDate).year;

    if (dDay && dMonth) {
      const dNum = parseInt(dDay, 10);
      const mNum = parseInt(dMonth, 10);
      const yNum = dYear ? parseInt(dYear, 10) : undefined;

      if (!isNaN(dNum) && !isNaN(mNum) && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        const thisYearEvent = new Date(currentYear, mNum - 1, dNum);
        const todayMidnight = new Date(currentYear, currentMonth - 1, currentDay);
        let diffMs = thisYearEvent.getTime() - todayMidnight.getTime();
        if (diffMs < 0) {
          const nextYearEvent = new Date(currentYear + 1, mNum - 1, dNum);
          diffMs = nextYearEvent.getTime() - todayMidnight.getTime();
        }
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const ageOrYearsAgo = yNum ? currentYear - yNum : undefined;

        list.push({
          person,
          type: 'death',
          day: dNum,
          month: mNum,
          year: yNum,
          dateStr: `${dNum} ${MONTH_NAMES_GENITIVE[mNum]}${yNum ? ` ${yNum} р.` : ''}`,
          ageOrYearsAgo,
          daysUntil,
        });
      }
    }
  });

  return list;
}
