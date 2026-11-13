import { FamilyTreeData, Person } from '../types/tree';

// Short fictional example tree (3 generations) used when there is no saved data
// and by the "load example" button. All names are made up.

const person = (p: Partial<Person> & Pick<Person, 'id' | 'firstName' | 'lastName' | 'gender' | 'x' | 'y'>): Person => ({
  parents: [],
  spouses: [],
  children: [],
  ...p,
});

export const sampleTreeData: FamilyTreeData = {
  id: 'sample-family-tree',
  title: 'Приклад родоводу',
  description: 'Вигаданий приклад родового дерева',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  selectedPersonId: 'p-sample-oleh',
  persons: {
    'p-sample-ivan': person({
      id: 'p-sample-ivan', firstName: 'Іван', lastName: 'Коваленко', gender: 'male',
      birthYear: '1931', deathYear: '2008', isDeceased: true, yearsDisplay: '1931 – 2008',
      spouses: ['p-sample-mariya'], children: ['p-sample-oleh', 'p-sample-natalya'],
      x: 300, y: 80,
    }),
    'p-sample-mariya': person({
      id: 'p-sample-mariya', firstName: 'Марія', lastName: 'Коваленко', maidenName: 'Шевчук', gender: 'female',
      birthYear: '1934', deathYear: '2015', isDeceased: true, yearsDisplay: '1934 – 2015',
      spouses: ['p-sample-ivan'], children: ['p-sample-oleh', 'p-sample-natalya'],
      x: 426, y: 80,
    }),
    'p-sample-natalya': person({
      id: 'p-sample-natalya', firstName: 'Наталя', lastName: 'Коваленко', gender: 'female',
      birthYear: '1962', yearsDisplay: '1962',
      parents: ['p-sample-ivan', 'p-sample-mariya'],
      x: 100, y: 240,
    }),
    'p-sample-oleh': person({
      id: 'p-sample-oleh', firstName: 'Олег', lastName: 'Коваленко', gender: 'male',
      birthYear: '1958', yearsDisplay: '1958',
      parents: ['p-sample-ivan', 'p-sample-mariya'], spouses: ['p-sample-iryna'],
      children: ['p-sample-olena', 'p-sample-maksym'],
      x: 300, y: 240,
    }),
    'p-sample-iryna': person({
      id: 'p-sample-iryna', firstName: 'Ірина', lastName: 'Коваленко', maidenName: 'Мельник', gender: 'female',
      birthYear: '1961', yearsDisplay: '1961',
      spouses: ['p-sample-oleh'], children: ['p-sample-olena', 'p-sample-maksym'],
      x: 426, y: 240,
    }),
    'p-sample-olena': person({
      id: 'p-sample-olena', firstName: 'Олена', lastName: 'Коваленко', gender: 'female',
      birthYear: '1985', yearsDisplay: '1985',
      parents: ['p-sample-oleh', 'p-sample-iryna'],
      x: 299, y: 400,
    }),
    'p-sample-maksym': person({
      id: 'p-sample-maksym', firstName: 'Максим', lastName: 'Коваленко', gender: 'male',
      birthYear: '1988', yearsDisplay: '1988',
      parents: ['p-sample-oleh', 'p-sample-iryna'],
      x: 427, y: 400,
    }),
  },
};
