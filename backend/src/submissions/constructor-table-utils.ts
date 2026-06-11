import type {
  ConstructorTableCell,
  TableSection,
} from './constructor-content.types';

export const CONSTRUCTOR_SCHEMA_VERSION = 2;

export function isTableCellCovered(
  cell: ConstructorTableCell | string,
): boolean {
  if (typeof cell === 'string') return false;
  return cell.covered === true;
}

export function getTableCellText(cell: ConstructorTableCell | string): string {
  return typeof cell === 'string' ? cell : (cell.text ?? '');
}

export function normalizeTableCell(
  cell: ConstructorTableCell | string,
): ConstructorTableCell {
  if (typeof cell === 'string') return { text: cell };
  return {
    text: cell.text ?? '',
    ...(cell.rowSpan && cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
    ...(cell.colSpan && cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
    ...(cell.covered ? { covered: true } : {}),
  };
}

export function normalizeTableRows(
  rows: (ConstructorTableCell | string)[][] | undefined,
): ConstructorTableCell[][] {
  if (!rows?.length) {
    return [
      [{ text: '' }, { text: '' }],
      [{ text: '' }, { text: '' }],
    ];
  }
  return rows.map((row) => row.map((cell) => normalizeTableCell(cell)));
}

export function normalizeTableSection(section: TableSection): TableSection {
  return {
    ...section,
    rows: normalizeTableRows(section.rows),
  };
}

export function tableRowHasContent(row: ConstructorTableCell[]): boolean {
  return row.some(
    (cell) =>
      !isTableCellCovered(cell) && getTableCellText(cell).trim().length > 0,
  );
}

export function mergeTableCellRange(
  rows: ConstructorTableCell[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): ConstructorTableCell[][] {
  const top = Math.min(r1, r2);
  const bottom = Math.max(r1, r2);
  const left = Math.min(c1, c2);
  const right = Math.max(c1, c2);
  const next = rows.map((row) => row.map((cell) => ({ ...cell })));
  const texts: string[] = [];
  for (let r = top; r <= bottom; r += 1) {
    for (let c = left; c <= right; c += 1) {
      const cell = next[r]?.[c];
      if (!cell || isTableCellCovered(cell)) continue;
      const t = getTableCellText(cell).trim();
      if (t) texts.push(t);
    }
  }
  for (let r = top; r <= bottom; r += 1) {
    for (let c = left; c <= right; c += 1) {
      const cell = next[r]?.[c];
      if (!cell) continue;
      if (r === top && c === left) {
        cell.text = texts.join(' ');
        cell.rowSpan = bottom - top + 1;
        cell.colSpan = right - left + 1;
        delete cell.covered;
      } else {
        cell.text = '';
        cell.rowSpan = undefined;
        cell.colSpan = undefined;
        cell.covered = true;
      }
    }
  }
  return next;
}

export function splitTableCell(
  rows: ConstructorTableCell[][],
  r: number,
  c: number,
): ConstructorTableCell[][] {
  const anchor = rows[r]?.[c];
  if (!anchor || isTableCellCovered(anchor)) return rows;
  const rowSpan = anchor.rowSpan ?? 1;
  const colSpan = anchor.colSpan ?? 1;
  if (rowSpan === 1 && colSpan === 1) return rows;
  const next = rows.map((row) => row.map((cell) => ({ ...cell })));
  const bottom = r + rowSpan - 1;
  const right = c + colSpan - 1;
  for (let rr = r; rr <= bottom; rr += 1) {
    for (let cc = c; cc <= right; cc += 1) {
      const cell = next[rr]?.[cc];
      if (!cell) continue;
      if (rr === r && cc === c) {
        cell.rowSpan = undefined;
        cell.colSpan = undefined;
        delete cell.covered;
      } else {
        cell.text = '';
        delete cell.rowSpan;
        delete cell.colSpan;
        delete cell.covered;
      }
    }
  }
  return next;
}
