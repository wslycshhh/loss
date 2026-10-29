import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRules, cables, connectors } from '../src/catalog.mjs';
import { validateRulePack, evaluateMask } from '../src/engine.mjs';

test('public catalogue retains sources, units and representative attenuation/mask values', () => {
  validateRulePack({ schemaVersion: 1, packId: 'public-catalog-check', rules: publicRules });
  for (const item of [...publicRules, ...cables, ...connectors]) {
    assert.equal(item.source.visibility, 'public');
    for (const key of ['title', 'url', 'revision', 'section', 'checkedAt']) assert.ok(item.source[key]);
    assert.equal(new URL(item.source.url).protocol, 'https:');
  }
  const leoni = cables.find(c => c.id === 'leoni-dacar302');
  assert.equal(leoni.points.find(p => p.fGHz === 1).dbPerM, 0.489);
  const lo = leoni.points.find(p => p.fGHz === 2.2);
  const hi = leoni.points.find(p => p.fGHz === 2.8);
  const interpolated = lo.dbPerM + (2.5 - lo.fGHz) / (hi.fGHz - lo.fGHz) * (hi.dbPerM - lo.dbPerM);
  assert.ok(Math.abs(interpolated - 0.792) < 1e-12);
  assert.equal(cables.find(c => c.id === 'caleb-stp-10gbase-t1').evidence, 'upper_limit');
  const six = publicRules.find(r => r.ruleId === 'adi-gmsl2-family-6g-coax');
  const segment = six.lossMasks.find(m => m.component === 'total' && m.metric === 'S21').segments[1];
  const [a, b, c] = segment.coefficients;
  assert.ok(Math.abs(a * Math.sqrt(3) + b * 3 + c - (-21.113063937629154)) < 1e-10);
  const three = publicRules.find(r => r.ruleId === 'adi-gmsl2-family-3g-stp');
  assert.equal(evaluateMask(three.lossMasks.find(m => m.component === 'total' && m.metric === 'Sdd11'), 3.5).signedDb, -8);
  assert.equal(publicRules.find(r => r.ruleId === 'ti-947-948-1link').rate.allowEvenSplit, false);
  for (const rule of publicRules.filter(r => r.vendor === '慷智 AIM' || r.serializer === 'DS90UB933-Q1')) {
    assert.equal(rule.verificationStatus, 'unavailable');
    assert.equal(rule.rate.kind, 'unavailable');
    assert.equal(rule.rate.modulation, 'unknown');
    assert.equal(rule.lossMasks.length, 0);
  }
});
