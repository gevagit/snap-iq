import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { Geometry } from '../src/content/schemas';
import { renderFieldSvg } from '../src/diagram/fieldSvg';

const g = Geometry.parse(loadRawContent().geometry);

describe('top-down field diagram', () => {
  const svg = renderFieldSvg(g, { spot: 'left_hash', losOwnYardLine: 42, toGo: 6 });

  it('is deterministic', () => {
    expect(renderFieldSvg(g, { spot: 'left_hash', losOwnYardLine: 42, toGo: 6 })).toBe(svg);
  });

  it('labels the 50 and the 40s around the own 42', () => {
    expect(svg).toContain('>50<');
    expect(svg).toContain('>40<');
  });

  it('draws the line of scrimmage and the line to gain', () => {
    expect(svg).toContain('stroke="#1F5FD1" stroke-width="3"');
    expect(svg).toContain('stroke-dasharray="8 6"');
  });
});
