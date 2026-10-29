import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRate, evaluateMask, validateRulePack } from '../src/engine.mjs';

const provenance = () => ({
  title: 'Synthetic test data only', url: 'https://example.invalid/synthetic',
  revision: '1', section: 'test', checkedAt: '2026-10-29', visibility: 'synthetic',
});
const makeRule = (overrides = {}) => ({
  ruleId: 'synthetic-32', vendor: 'Synthetic', serializer: 'TEST-TX', deserializer: 'TEST-RX',
  direction: 'display', media: ['STP', 'Coax'], physicalLinkCounts: [1], verificationStatus: 'synthetic',
  source: provenance(), rate: { kind: 'frame', frameBits: 32, modulation: 'NRZ', pixelsPerClockSupported: [1] },
  lossMasks: [], ...overrides,
});
const pack = (rules = [makeRule()]) => ({ schemaVersion: 1, packId: 'synthetic-test', rules });
const display = (overrides = {}) => ({
  pclkMode: 'spec', pclkMHz: 150, width: 1920, height: 1080, refreshHz: 60, ...overrides,
});
const makeMask = (overrides = {}) => ({
  component: 'total', metric: 'Sdd21', comparison: 'min', referencePlane: 'Synthetic connector planes',
  referenceOhms: 100, segments: [{ rangeGHz: [0.1, 5], coefficients: [-1, -2, -3] }],
  verificationStatus: 'synthetic', source: provenance(), ...overrides,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, actual + ' != ' + expected);

test('32/40 synthetic frame sizes calculate separate payload and physical rate', () => {
  const r32 = calculateRate(display(), makeRule());
  assert.equal(r32.status, 'OK');
  close(r32.videoPayloadGbps, 2.985984);
  close(r32.clockedVideoGbps, 3.6);
  close(r32.lineRateGbpsPerLink, 4.8);
  close(r32.nyquistGHz, 2.4);
  const r40 = calculateRate(display(), makeRule({ rate: { kind: 'frame', frameBits: 40, modulation: 'NRZ' } }));
  close(r40.lineRateGbpsPerLink, 6);
});

test('deserializer video output count never halves a physical link', () => {
  const a = calculateRate(display(), makeRule());
  const b = calculateRate(display({ deserializerVideoOutputCount: 2 }), makeRule());
  assert.equal(a.lineRateGbpsPerLink, b.lineRateGbpsPerLink);
  assert.equal(b.totalLineRateGbps, 4.8);
});

test('physical two-link split requires count support and explicit split confirmation', () => {
  const input = display({ serdesPhysicalLinkCount: 2 });
  assert.equal(calculateRate(input, makeRule()).status, 'Unsupported');
  const supported = makeRule({ physicalLinkCounts: [1, 2] });
  const unconfirmed = calculateRate(input, supported);
  assert.equal(unconfirmed.status, 'TBD');
  assert.equal(unconfirmed.lineRateGbpsPerLink, null);
  const confirmed = calculateRate(input, { ...supported, rate: { ...supported.rate, allowEvenSplit: true } });
  assert.equal(confirmed.status, 'OK');
  close(confirmed.lineRateGbpsPerLink, 2.4);
  close(confirmed.totalLineRateGbps, 4.8);
});

test('fixed rate is per physical link; PAM4 halves symbols and Nyquist again', () => {
  const value = makeRule({ physicalLinkCounts: [1, 2], rate: { kind: 'fixed', lineRateGbps: 6, modulation: 'PAM4', allowEvenSplit: true } });
  const result = calculateRate(display({ serdesPhysicalLinkCount: 2 }), value);
  assert.equal(result.status, 'OK');
  assert.equal(result.lineRateGbpsPerLink, 6);
  assert.equal(result.totalLineRateGbps, 12);
  assert.equal(result.symbolRateGBd, 3);
  assert.equal(result.nyquistGHz, 1.5);
});

test('unknown modulation preserves physical bitrate, with unresolved symbol rate', () => {
  const result = calculateRate(display(), makeRule({ rate: { kind: 'fixed', lineRateGbps: 6, modulation: 'unknown' } }));
  assert.equal(result.status, 'TBD');
  assert.equal(result.lineRateGbpsPerLink, 6);
  assert.equal(result.nyquistGHz, null);
});

test('estimate uses visible blanking coefficient and timing uses exact totals', () => {
  const estimate = calculateRate(display({ pclkMode: 'estimate', blankingFactor: 1.2 }), makeRule());
  close(estimate.pclkMHz, 149.2992);
  const timing = calculateRate(display({ pclkMode: 'timing', hTotal: 2200, vTotal: 1125 }), makeRule());
  close(timing.pclkMHz, 148.5);
  assert.equal(calculateRate(display({ pclkMode: 'estimate', blankingFactor: 0.9 }), makeRule()).status, 'Unsupported');
  assert.equal(calculateRate(display({ pclkMode: 'timing', hTotal: 1000, vTotal: 1125 }), makeRule()).status, 'Unsupported');
});

test('double pixel mode needs explicit confirmation and calculates equivalent pixel rate', () => {
  const unknown = calculateRate(display({ pixelsPerClock: 2 }), makeRule());
  assert.equal(unknown.status, 'TBD');
  assert.equal(unknown.lineRateGbpsPerLink, null);
  const value = makeRule({ rate: { kind: 'frame', frameBits: 32, modulation: 'NRZ', pixelsPerClockSupported: [1, 2] } });
  const result = calculateRate(display({ pclkMHz: 75, pixelsPerClock: 2 }), value);
  assert.equal(result.status, 'OK');
  assert.equal(result.equivalentPixelMHz, 150);
  assert.equal(result.lineRateGbpsPerLink, 4.8);
  const estimate = calculateRate(display({ pclkMode: 'estimate', blankingFactor: 1.2, pixelsPerClock: 2 }), value);
  close(estimate.pclkMHz, 74.6496);
  close(estimate.equivalentPixelMHz, 149.2992);
});

test('insufficient pixel clock and chip limits are Unsupported but retain useful arithmetic', () => {
  const insufficient = calculateRate(display({ pclkMHz: 100 }), makeRule());
  assert.equal(insufficient.status, 'Unsupported');
  assert.equal(insufficient.lineRateGbpsPerLink, 3.2);
  const value = makeRule({ rate: { kind: 'frame', frameBits: 32, modulation: 'NRZ', pclkMaxMHz: 140 } });
  const outside = calculateRate(display(), value);
  assert.equal(outside.status, 'Unsupported');
  assert.equal(outside.pclkMHz, 150);
  assert.equal(outside.lineRateGbpsPerLink, 4.8);
});

test('missing active resolution is null payload; known PCLK still supports physical formula', () => {
  const result = calculateRate({ pclkMode: 'spec', pclkMHz: 150 }, makeRule());
  assert.equal(result.status, 'OK');
  assert.equal(result.videoPayloadGbps, null);
  assert.equal(result.lineRateGbpsPerLink, 4.8);
});

test('insufficient fixed capacity is Unsupported and remains explainable', () => {
  const result = calculateRate(display(), makeRule({ rate: { kind: 'fixed', lineRateGbps: 2, modulation: 'NRZ' } }));
  assert.equal(result.status, 'Unsupported');
  close(result.videoPayloadGbps, 2.985984);
  assert.equal(result.lineRateGbpsPerLink, 2);
});

test('unconfirmed physical rate is TBD while pending masks do not block confirmed rate', () => {
  assert.equal(calculateRate(display(), makeRule({ verificationStatus: 'pending_vendor' })).lineRateGbpsPerLink, null);
  const result = calculateRate(display(), makeRule({ verificationStatus: 'verified_public', lossMasks: [makeMask({ verificationStatus: 'pending_vendor', segments: [] })] }));
  assert.equal(result.status, 'OK');
  assert.equal(result.lineRateGbpsPerLink, 4.8);
});

test('user-confirmed restricted vendor rate computes with an explicit provenance warning', () => {
  const result = calculateRate(display(), makeRule({ verificationStatus: 'user_confirmed_vendor', source: { ...provenance(), visibility: 'restricted' } }));
  assert.equal(result.status, 'OK');
  assert.equal(result.lineRateGbpsPerLink, 4.8);
  assert.ok(result.warnings.some(v => v.includes('public written correction')));
});

test('camera payload/CSI and known fixed SerDes rate are independent quantities', () => {
  const camera = makeRule({ direction: 'camera', rate: { kind: 'fixed', lineRateGbps: 6, modulation: 'NRZ' } });
  const result = calculateRate({ direction: 'camera', width: 1920, height: 1080, fps: 30, rawBits: 12, csiLanes: 2, csiLaneGbps: 1.5 }, camera);
  assert.equal(result.status, 'OK');
  close(result.videoPayloadGbps, 0.746496);
  assert.equal(result.csiCapacityGbps, 3);
  assert.equal(result.lineRateGbpsPerLink, 6);
  assert.equal(result.clockedVideoGbps, null);
  assert.equal(result.nyquistGHz, 3);
  assert.equal(calculateRate({ direction: 'camera', width: 1920, height: 1080, fps: 30, rawBits: 12, csiLanes: 1, csiLaneGbps: 0.5 }, camera).status, 'Unsupported');
});

test('camera frame formula without PCLK is unresolved; missing CSI half pair fails explicitly', () => {
  const camera = makeRule({ direction: 'camera' });
  const input = { direction: 'camera', width: 1920, height: 1080, fps: 30, rawBits: 12 };
  assert.equal(calculateRate(input, camera).status, 'TBD');
  assert.equal(calculateRate(input, camera).lineRateGbpsPerLink, null);
  assert.equal(calculateRate({ ...input, csiLanes: 2 }, camera).status, 'Unsupported');
});

test('wrong direction/media, invalid numbers and unknown inputs are rejected', () => {
  for (const input of [
    display({ direction: 'camera' }), display({ media: 'STP' }), display({ width: NaN }),
    display({ pclkMHz: Infinity }), display({ serdesPhysicalLinkCount: 0.5 }),
    display({ bitsPerPixel: -24 }), display({ injected: '1+1' }),
  ]) {
    const value = makeRule({ media: ['Coax'] });
    assert.equal(calculateRate(input, value).status, 'Unsupported');
  }
});

test('mask polynomial and sqrt-linear coefficients follow the declared order', () => {
  const quadratic = evaluateMask(makeMask(), 2);
  assert.deepEqual(quadratic, { status: 'OK', signedDb: -11, positiveLossDb: 11 });
  const sqrt = evaluateMask(makeMask({ segments: [{ rangeGHz: [0.1, 5], model: 'sqrt-linear', coefficients: [-2, -1, -3] }] }), 4);
  assert.deepEqual(sqrt, { status: 'OK', signedDb: -11, positiveLossDb: 11 });
});

test('mask never extrapolates and rejects non-positive frequencies', () => {
  for (const frequency of [0.01, 6]) {
    const result = evaluateMask(makeMask(), frequency);
    assert.equal(result.status, 'TBD');
    assert.equal(result.signedDb, null);
  }
  for (const frequency of [0, -1, NaN, Infinity, '1']) assert.equal(evaluateMask(makeMask(), frequency).status, 'Unsupported');
  assert.equal(evaluateMask(makeMask(), 0.1).status, 'OK');
  assert.equal(evaluateMask(makeMask(), 5).status, 'OK');
});

test('pending mask arithmetic remains labeled unconfirmed and positive gain is not positive loss', () => {
  assert.equal(evaluateMask(makeMask({ verificationStatus: 'pending_vendor' }), 2).status, 'TBD');
  const gain = evaluateMask(makeMask({ segments: [{ rangeGHz: [1, 5], coefficients: [0, 0, 2] }] }), 2);
  assert.equal(gain.signedDb, 2);
  assert.equal(gain.positiveLossDb, null);
  assert.ok(gain.warning);
});

test('valid packs are detached and reject duplicates atomically', () => {
  const original = pack();
  const output = validateRulePack(original);
  assert.deepEqual(output, original);
  output.rules[0].rate.frameBits = 40;
  assert.equal(original.rules[0].rate.frameBits, 32);
  const existing = [makeRule({ ruleId: 'existing' })];
  const snapshot = structuredClone(existing);
  const badPack = pack([makeRule(), makeRule({ ruleId: 'existing' })]);
  assert.throws(() => validateRulePack(badPack, existing), /duplicate ruleId/);
  assert.deepEqual(existing, snapshot);
  assert.equal(badPack.rules[0].ruleId, 'synthetic-32');
  assert.throws(() => validateRulePack(pack([makeRule(), makeRule()])), /duplicate ruleId/);
});

test('unknown fields are rejected at every import layer; formulas are never executable', () => {
  const mutations = [
    p => { p.unknown = true; },
    p => { p.rules[0].unknown = true; },
    p => { p.rules[0].source.unknown = true; },
    p => { p.rules[0].rate.expression = 'process.exit(1)'; },
    p => { p.rules[0].lossMasks[0].unknown = true; },
    p => { p.rules[0].lossMasks[0].source.unknown = true; },
    p => { p.rules[0].lossMasks[0].segments[0].expression = '1/f'; },
  ];
  for (const mutate of mutations) {
    const candidate = pack([makeRule({ lossMasks: [makeMask()] })]);
    mutate(candidate);
    assert.throws(() => validateRulePack(candidate), /unknown field/);
  }
});

test('all rule/source number and frequency boundaries are validated', () => {
  const mutations = [
    p => { p.schemaVersion = 2; },
    p => { p.rules[0].source.checkedAt = '2026-02-30'; },
    p => { p.rules[0].source.url = 'javascript:alert(1)'; },
    p => { p.rules[0].source.visibility = 'internal'; },
    p => { p.rules[0].rate.frameBits = Infinity; },
    p => { p.rules[0].rate.pclkMinMHz = 200; p.rules[0].rate.pclkMaxMHz = 100; },
    p => { p.rules[0].physicalLinkCounts = [0.5]; },
    p => { p.rules[0].media = ['Coax', 'Coax']; },
    p => { p.rules[0].lossMasks[0].referenceOhms = 0; },
    p => { p.rules[0].lossMasks[0].segments[0].coefficients = [0, NaN, 1]; },
    p => { p.rules[0].lossMasks[0].segments[0].rangeGHz = [2, 1]; },
    p => { p.rules[0].lossMasks[0].segments[0].model = 'eval'; },
    p => { p.rules[0].lossMasks[0].segments.push({ rangeGHz: [1, 6], coefficients: [0, 0, -1] }); },
  ];
  for (const mutate of mutations) {
    const candidate = pack([makeRule({ lossMasks: [makeMask()] })]);
    mutate(candidate);
    assert.throws(() => validateRulePack(candidate), TypeError);
  }
});

test('mask permits gaps and selects the stricter threshold at a discontinuous shared endpoint', () => {
  const gap = makeMask({ segments: [
    { rangeGHz: [0, 1], coefficients: [0, 0, -1] },
    { rangeGHz: [2, 3], coefficients: [0, 0, -2] },
  ] });
  assert.equal(evaluateMask(gap, 1.5).status, 'TBD');
  const joined = makeMask({ segments: [
    { rangeGHz: [0, 1], coefficients: [0, 0, -1] },
    { rangeGHz: [1, 3], coefficients: [0, 0, -2] },
  ] });
  assert.equal(evaluateMask(joined, 1).signedDb, -1);
  assert.equal(evaluateMask({ ...joined, comparison: 'max' }, 1).signedDb, -2);
});

test('root notes are optional string/string[] and unavailable rate is a valid TBD rule', () => {
  assert.ok(validateRulePack(pack([makeRule({ notes: ['Synthetic only'], rate: { kind: 'unavailable', modulation: 'unknown' } })])));
  assert.ok(validateRulePack(pack([makeRule({ notes: 'Synthetic only' })])));
  assert.throws(() => validateRulePack(pack([makeRule({ notes: {} })])), TypeError);
  const result = calculateRate(display(), makeRule({ rate: { kind: 'unavailable', modulation: 'unknown' } }));
  assert.equal(result.status, 'TBD');
  assert.equal(result.lineRateGbpsPerLink, null);
});

test('overflow never leaks non-finite calculated numbers', () => {
  const result = calculateRate(display({ pclkMHz: Number.MAX_VALUE }), makeRule());
  assert.equal(result.status, 'Unsupported');
  for (const value of Object.values(result)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});

test('restricted/synthetic sources may omit public URL, public sources must have HTTP(S)', () => {
  for (const visibility of ['restricted', 'synthetic']) assert.ok(validateRulePack(pack([makeRule({ source: { ...provenance(), visibility, url: '' } })])));
  assert.throws(() => validateRulePack(pack([makeRule({ source: { ...provenance(), visibility: 'public', url: '' } })])), /url/);
});

test('both direction rules accept camera and display without confusing their payloads', () => {
  const both = makeRule({ direction: 'both', rate: { kind: 'fixed', lineRateGbps: 6, modulation: 'NRZ' } });
  assert.equal(calculateRate(display(), both).status, 'OK');
  assert.equal(calculateRate({ direction: 'camera', width: 100, height: 100, fps: 30, rawBits: 12 }, both).status, 'OK');
});

