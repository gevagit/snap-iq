import { describe, expect, it } from 'vitest';
import { loadRawContent } from '../src/content/load';
import { contentFrom, dealRep, repFor, stepsFor, withOverrides } from '../src/routine2';

const C = contentFrom(loadRawContent());

describe('routine v2: our plays against the looks', () => {
  it('deals the same rep from the same seed, and every rep has 11 on defense and a full key', () => {
    expect(JSON.stringify(dealRep(C, 5, 2, { playtest: true }))).toBe(JSON.stringify(dealRep(C, 5, 2, { playtest: true })));
    for (let i = 0; i < 300; i++) {
      const rep = dealRep(C, 11, i, { playtest: true })!;
      expect(rep, `rep ${i}`).toBeTruthy();
      expect(rep.defense.length, `${rep.play.id} vs ${rep.look.id}`).toBe(11);
      if (rep.after) expect(rep.after.length).toBe(11);
      const steps = stepsFor(C, rep);
      expect(steps[0]).toBe('down-distance');
      expect(steps.at(-1)).toBe('last-scan');
      expect(steps.includes('run-check')).toBe(rep.isRun);
      expect(steps.includes('reads')).toBe(!rep.isRun);
      expect(rep.keys.edges.length).toBe(2);
      for (const d of rep.defense) { expect(Number.isFinite(d.x) && Number.isFinite(d.y), d.id).toBe(true); }
    }
  });
  it('unreviewed plays and looks stay out of drills without the playtest setting', () => {
    expect(dealRep(C, 1, 0, { playtest: false })).toBeNull();
  });
  it('down & distance sets the yardage and the must-convert down; plays come up in their situations', () => {
    for (let i = 0; i < 60; i++) {
      const rep = repFor(C, 'gun-trips-90-slip-screen', 'trips-check', i + 1);
      expect(rep.situation.distance).toBeGreaterThanOrEqual(7);
      expect(rep.keys.yardage).toBe('long');
      expect(rep.keys.mustConvert).toBe(rep.situation.down >= 3);
    }
  });
  it('the reads follow the situation (play 23: short yardage X/Y, long H/Z) and the owner can override them', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) { const rep = repFor(C, 'gun-trips-rub', 'trips-cover-2-nickel', i + 1); seen.add(`${rep.keys.yardage}:${rep.keys.reads?.join('')}:${rep.keys.footwork}`); }
    expect([...seen].some((s) => s.startsWith('long:HZ:five-step-drop'))).toBe(true);
    expect([...seen].some((s) => s.startsWith('short:XY:three-step-drop'))).toBe(true);
    const rep = withOverrides(repFor(C, 'gun-trips-rub', 'trips-cover-2-nickel'), { 'gun-trips-rub': { '*': { reads: ['Z'] } } });
    expect(rep.keys.reads).toEqual(['Z']);
  });
  it('a run play asks the run check and skips reads and footwork; a deep read asks the look-off', () => {
    const run = repFor(C, 'power-rt-22-blast', 'heavy-44-cover-3');
    expect(stepsFor(C, run)).toContain('run-check');
    expect(stepsFor(C, run)).not.toContain('footwork');
    const deep = repFor(C, 'gun-trips-rub', 'trips-cover-3-rotated', 3);
    if (deep.keys.reads?.some((id) => ['H', 'Z', 'X', 'Y'].includes(id))) expect(deep.keys.lookOff).not.toBeNull();
  });
});
