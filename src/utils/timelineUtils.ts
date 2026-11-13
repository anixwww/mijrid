import { Person } from '../types/tree';
import { extractBirthYear, extractDeathYear } from './dateUtils';

export { extractBirthYear, extractDeathYear };

export const DEFAULT_START_YEAR = 1750;
export const DEFAULT_END_YEAR = 2030;
export const DEFAULT_PIXELS_PER_YEAR = 6; // 10 years = 60px, 25 years = 150px
const TIMELINE_TOP_OFFSET = 80;

/**
 * Checks if a person lived or was active during a given year range [minYear, maxYear]
 */
export function isPersonInYearRange(person: Person, minYear: number, maxYear: number): boolean {
  const bYr = extractBirthYear(person);
  const dYr = extractDeathYear(person);

  if (bYr !== null && dYr !== null) {
    return bYr <= maxYear && dYr >= minYear;
  }

  if (bYr !== null) {
    if (!person.isDeceased) {
      return bYr <= maxYear && 2026 >= minYear;
    } else {
      const estEnd = bYr + 75;
      return bYr <= maxYear && estEnd >= minYear;
    }
  }

  if (dYr !== null) {
    const estStart = dYr - 75;
    return estStart <= maxYear && dYr >= minYear;
  }

  if (person.yearsDisplay) {
    const matchedYears = person.yearsDisplay.match(/\b(1[6-9]\d{2}|20\d{2})\b/g);
    if (matchedYears) {
      return matchedYears.some((yStr) => {
        const y = parseInt(yStr, 10);
        return y >= minYear && y <= maxYear;
      });
    }
  }

  return false;
}

/**
 * Converts a year to Y coordinate on canvas
 */
export function yearToY(
  year: number,
  startYear: number = DEFAULT_START_YEAR,
  pixelsPerYear: number = DEFAULT_PIXELS_PER_YEAR
): number {
  return TIMELINE_TOP_OFFSET + (year - startYear) * pixelsPerYear;
}

export interface TimelineTick {
  year: number;
  y: number;
  isMajor: boolean; // e.g. every 50 or 25 years
  isCentury: boolean;
}

/**
 * Generates ticks for the timeline
 */
export function generateTimelineTicks(
  startYear: number = DEFAULT_START_YEAR,
  endYear: number = DEFAULT_END_YEAR,
  stepYears: number = 10,
  pixelsPerYear: number = DEFAULT_PIXELS_PER_YEAR
): TimelineTick[] {
  const ticks: TimelineTick[] = [];

  // Round startYear down to multiple of stepYears
  const firstYear = Math.floor(startYear / stepYears) * stepYears;
  const lastYear = Math.ceil(endYear / stepYears) * stepYears;

  for (let yr = firstYear; yr <= lastYear; yr += stepYears) {
    ticks.push({
      year: yr,
      y: yearToY(yr, startYear, pixelsPerYear),
      isMajor: yr % 25 === 0,
      isCentury: yr % 100 === 0,
    });
  }

  return ticks;
}
