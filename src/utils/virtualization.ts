import { CARD_WIDTH, CARD_HEIGHT } from './treeLayout';

const GRID_CELL_SIZE = 350;

/**
 * Builds a Spatial Hash Grid index for O(1) cell lookup of canvas elements
 */
export function buildSpatialGrid<T>(
  items: T[],
  getBounds: (item: T) => { minX: number; maxX: number; minY: number; maxY: number }
): Map<string, T[]> {
  const grid = new Map<string, T[]>();

  items.forEach((item) => {
    const { minX, maxX, minY, maxY } = getBounds(item);
    const startX = Math.floor(minX / GRID_CELL_SIZE);
    const endX = Math.floor(maxX / GRID_CELL_SIZE);
    const startY = Math.floor(minY / GRID_CELL_SIZE);
    const endY = Math.floor(maxY / GRID_CELL_SIZE);

    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        const key = `${cx}:${cy}`;
        let list = grid.get(key);
        if (!list) {
          list = [];
          grid.set(key, list);
        }
        list.push(item);
      }
    }
  });

  return grid;
}

/**
 * Retrieves only items contained in grid cells intersecting the visible viewport bounding box
 */
export function getVisibleItemsFromGrid<T>(
  grid: Map<string, T[]>,
  viewportBounds: { minX: number; maxX: number; minY: number; maxY: number }
): T[] {
  const startX = Math.floor(viewportBounds.minX / GRID_CELL_SIZE);
  const endX = Math.floor(viewportBounds.maxX / GRID_CELL_SIZE);
  const startY = Math.floor(viewportBounds.minY / GRID_CELL_SIZE);
  const endY = Math.floor(viewportBounds.maxY / GRID_CELL_SIZE);

  const resultSet = new Set<T>();

  for (let cx = startX; cx <= endX; cx++) {
    for (let cy = startY; cy <= endY; cy++) {
      const key = `${cx}:${cy}`;
      const itemsInCell = grid.get(key);
      if (itemsInCell) {
        for (let i = 0; i < itemsInCell.length; i++) {
          resultSet.add(itemsInCell[i]);
        }
      }
    }
  }

  return Array.from(resultSet);
}
