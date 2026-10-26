import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { Geometry } from '../src/content/schemas';
import { apex, box, fieldFrame, freeBlockingZone, inRect, isInBounds, numberReceivers, outsideFreeBlockingZone } from '../src/field/geometry';

const g = Geometry.parse(loadRawContent().geometry);

describe('field frame', () => {
  it('places sidelines and hashes for the ball on the left hash', () => {
    const f = fieldFrame(g, 'left_hash');
    expect(f.leftSideline).toBeCloseTo(-17.78, 2);
    expect(f.rightSideline).toBeCloseTo(35.56, 2);
    expect(f.leftHash).toBeCloseTo(0, 6);
    expect(f.rightHash).toBeCloseTo(17.78, 2); // hashes split the field into thirds
    expect(f.fieldSide).toBe('right');
    expect(f.boundarySide).toBe('left');
  });

  it('has no field or boundary side with the ball in the middle', () => {
    const f = fieldFrame(g, 'middle');
    expect(f.leftSideline).toBeCloseTo(-26.67, 2);
    expect(f.rightHash).toBeCloseTo(8.89, 2);
    expect(f.fieldSide).toBeNull();
  });

  it('mirrors for the right hash', () => {
    const f = fieldFrame(g, 'right_hash');
    expect(f.rightSideline).toBeCloseTo(17.78, 2);
    expect(f.fieldSide).toBe('left');
  });

  it('treats the sideline itself as out of bounds', () => {
    const f = fieldFrame(g, 'left_hash');
    expect(isInBounds(f, -17.7)).toBe(true);
    expect(isInBounds(f, f.leftSideline)).toBe(false);
  });

  it('puts the numbers outside the hashes', () => {
    const f = fieldFrame(g, 'middle');
    expect(f.numbersLeft).toBeLessThan(f.leftHash);
    expect(f.numbersRight).toBeGreaterThan(f.rightHash);
  });
});

describe('landmarks', () => {
  it('free-blocking zone is 4 yd each side and 3 yd behind each line', () => {
    expect(freeBlockingZone(g)).toEqual({ xMin: -4, xMax: 4, yMin: -3, yMax: 3 });
    expect(outsideFreeBlockingZone(g, 4.5)).toBe(true);
    expect(outsideFreeBlockingZone(g, -3.9)).toBe(false);
  });

  it('counts the Stick look box as 6 (PRD Appendix B)', () => {
    const b = box(g, -2.8, 4.2); // LT and attached Y
    const defenders = { '91': [-3.6, 1.1], '72': [-0.7, 1.0], '95': [2.1, 1.0], '97': [5.1, 1.1], '52': [0.8, 4.6], '44': [-2.8, 4.6], '21': [6.8, 4.4], '6': [15, 10.5], '31': [-2, 12], '24': [-12.8, 7], '3': [24.8, 7] } as const;
    const inBox = Object.entries(defenders).filter(([, [x, y]]) => inRect(b, x, y)).map(([id]) => id).sort();
    expect(inBox).toEqual(['44', '52', '72', '91', '95', '97'].sort());
  });

  it('puts the apex between the end man and #2', () => {
    expect(apex(g, 4.2, 9)).toEqual({ x: 6.6, y: 4.5 });
  });

  it('numbers trips right from the sideline in', () => {
    const n = numberReceivers([{ id: 'X', x: -12 }, { id: 'Y', x: 4.2 }, { id: 'H', x: 9 }, { id: 'Z', x: 24 }, { id: 'R', x: 0, inBackfieldBehindBall: true }]);
    expect(n).toEqual({ X: { side: 'left', number: 1 }, Z: { side: 'right', number: 1 }, H: { side: 'right', number: 2 }, Y: { side: 'right', number: 3 } });
  });
});
