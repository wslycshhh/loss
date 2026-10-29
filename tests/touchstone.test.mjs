import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTouchstone, deriveMetrics, compareMeasurement } from '../src/touchstone.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const confirmed = { mappingConfirmed: true, referencePlane: 'fixture tips' };
const s2p = '# GHz S RI R 50\n1 .1 0 .5 0 .3 0 .2 0\n2 .2 0 .4 0 .1 0 .2 0';
const mask = { metric: 'S21', comparison: 'min', referencePlane: 'fixture tips', referenceOhms: 50, verificationStatus: 'verified_public' };
const evaluate = (_mask, fGHz) => fGHz <= 2 ? { status: 'OK', signedDb: -8 } : { status: 'TBD' };

test('s2p standard order, signed dB and source frequencies survive parsing', () => {
  const parsed = parseTouchstone(s2p);
  assert.equal(parsed.referenceOhms, 50);
  assert.equal(parsed.points[0].s[1][0].re, .5);
  assert.equal(parsed.points[0].s[0][1].re, .3);
  const metrics = deriveMetrics(parsed, confirmed);
  assert.equal(metrics.metricFamily, 'single_ended');
  assert.deepEqual(metrics.points.map(point => point.fGHz), [1, 2]);
  close(metrics.points[0].ilDb, 20 * Math.log10(.5));
  close(metrics.points[0].rlDb, -20);
});

test('all units, MA/DB angle conversion, comments, defaults and pair folding', () => {
  for (const [unit, frequency] of [['Hz', '1e9'], ['kHz', '1e6'], ['MHz', '1e3'], ['GHz', '1']]) {
    const parsed = parseTouchstone(`! synthetic\n# ${unit} S MA R 50 ! option\n${frequency} .1 180 .5 90\n .3 0 .2 -90 ! folded`);
    close(parsed.points[0].frequencyHz, 1e9);
    close(parsed.points[0].s[1][0].im, .5);
    close(parsed.points[0].s[0][0].re, -.1);
  }
  const db = parseTouchstone('# MHz S DB R 50\r1000 -20 180 -6 90 -12 0 -20 0');
  close(db.points[0].s[1][0].im, 10 ** (-6 / 20));
  assert.equal(parseTouchstone('#\n1 .1 0 .5 0 .3 0 .2 0').referenceOhms, 50);
  assert.equal(parseTouchstone('# r 50 ri s ghz\n1 .1 0 .5 0 .3 0 .2 0').points.length, 1);
});

test('s4p is row-major, differential mapping and complex cancellation are explicit', () => {
  // Non-reciprocal synthetic matrix: a transposed parser gives the wrong Sdd21.
  const parsed = parseTouchstone(`# GHz S RI R 50
1 .2 .1 .11 0 .04 .02 .12 0
 .8 .2 .21 0 .1 .02 .22 0
 .02 .01 .31 0 .1 .03 .32 0
 .2 .04 .41 0 .6 .06 .42 0`, 4);
  assert.equal(parsed.points[0].s[0][1].re, .11);
  assert.equal(parsed.points[0].s[1][0].re, .8);
  const metrics = deriveMetrics(parsed, { ...confirmed, inputPlus: 1, inputMinus: 3, outputPlus: 2, outputMinus: 4 });
  assert.equal(metrics.referenceOhms, 100);
  assert.equal(metrics.metricFamily, 'differential');
  close(metrics.points[0].ilDb, 20 * Math.log10(Math.hypot((.8 - .1 - .2 + .6) / 2, (.2 - .02 - .04 + .06) / 2)));
  close(metrics.points[0].rlDb, 20 * Math.log10(Math.hypot((.2 - .04 - .02 + .1) / 2, (.1 - .02 - .01 + .03) / 2)));
  assert.throws(() => deriveMetrics(parsed, confirmed), /distinct valid/);
  assert.throws(() => deriveMetrics(parsed, { ...confirmed, inputMinus: 1, outputMinus: 4 }), /distinct valid/);
});

test('unsupported, unknown and incomplete contents are rejected rather than ignored', () => {
  const bad = [
    '[Version] 2.0\n# GHz S RI R 50',
    '# GHz Y RI R 50\n1 0 0 0 0 0 0 0 0',
    '# GHz S RI R 50 unknown\n1 0 0 0 0 0 0 0 0',
    '# GHz S RI R 50\n1 0 0 0 0 0 0',
    `${s2p}\n.1 1 0 0 0\n.2 1 0 0 0`, // v1 noise tail
    `${s2p}\n3 0 0 0 0 0 0 0 0 extra`,
    `${s2p}\n# GHz S RI R 50`,
    '# GHz S RI R 50\n1 Infinity 0 0 0 0 0 0 0',
    '# GHz S RI R 50\n1 0x10 0 0 0 0 0 0 0',
    '# GHz S MA R 50\n1 -1 0 0 0 0 0 0 0',
    '# GHz S RI R 0\n1 0 0 0 0 0 0 0 0',
    '# GHz S DB R 50\n1 10000 0 0 0 0 0 0 0',
    '# GHz S RI R 50\n1e308 0 0 0 0 0 0 0 0',
    '1 0 0 0 0 0 0 0 0',
  ];
  for (const text of bad) assert.throws(() => parseTouchstone(text), Error, text);
  assert.throws(() => parseTouchstone(s2p, 3), /Only/);
  assert.throws(() => parseTouchstone(null), /text/);
});

test('frequencies must strictly increase and mapping/reference confirmation is required', () => {
  for (const frequency of ['1', '.5', '-1']) assert.throws(() => parseTouchstone(`# GHz S RI R 50\n1 0 0 0 0 0 0 0 0\n${frequency} 0 0 0 0 0 0 0 0`), /strictly increasing/);
  const parsed = parseTouchstone(s2p);
  assert.throws(() => deriveMetrics(parsed), /mapping/);
  assert.throws(() => deriveMetrics(parsed, { mappingConfirmed: true }), /reference plane/);
  assert.throws(() => deriveMetrics(parsed, { ...confirmed, outputPlus: 1 }), /distinct valid/);
  const non50 = parseTouchstone(s2p.replace('R 50', 'R 75'));
  assert.equal(non50.referenceOhms, 75);
  assert.throws(() => deriveMetrics(non50, confirmed), /renormalization/);
});

test('source-point comparison respects IL min and RL max margin directions', () => {
  const metrics = deriveMetrics(parseTouchstone(s2p), confirmed);
  const il = compareMeasurement(metrics, mask, evaluate);
  assert.equal(il.status, 'measured_pass');
  assert.deepEqual(il.points.map(point => point.fGHz), [1, 2]);
  close(il.worstMarginDb, metrics.points[1].ilDb + 8);
  const ilFail = compareMeasurement(metrics, mask, () => ({ status: 'OK', signedDb: -7 }));
  assert.equal(ilFail.status, 'measured_exceedance');
  assert.ok(ilFail.worstMarginDb < 0);
  const rl = compareMeasurement(metrics, { ...mask, metric: 'S11', comparison: 'max' }, () => ({ status: 'OK', signedDb: -15 }));
  assert.equal(rl.status, 'measured_exceedance');
  close(rl.points[0].marginDb, 5);
  assert.ok(rl.points[1].marginDb < 0);
  assert.match(rl.warning, /between points/);
});

test('missing/unverified mask, mismatched reference plane/impedance/family cannot pass', () => {
  const metrics = deriveMetrics(parseTouchstone(s2p), confirmed);
  for (const candidate of [null, { ...mask, verificationStatus: 'pending' }, { ...mask, referencePlane: 'board edge' }, { ...mask, referenceOhms: 100 }, { ...mask, metric: 'Sdd21' }, { ...mask, metric: 'unknown' }]) {
    assert.equal(compareMeasurement(metrics, candidate, evaluate).status, 'TBD');
  }
  assert.ok(compareMeasurement(metrics, { ...mask, verificationStatus: 'pending' }, evaluate).points.every(point => point.status === 'TBD'));
  assert.equal(compareMeasurement({ ...metrics, points: [] }, mask, evaluate).status, 'TBD');
  assert.equal(compareMeasurement(metrics, mask, () => ({ status: 'TBD' })).status, 'TBD');
  assert.equal(compareMeasurement({ ...metrics, points: [...metrics.points, { fGHz: 3, ilDb: -7, rlDb: -20 }] }, mask, evaluate).status, 'TBD');
  assert.throws(() => compareMeasurement(metrics, mask), /evaluator/);
});

test('an exact zero S parameter remains -Infinity dB and compares with the correct sign', () => {
  const metrics = deriveMetrics(parseTouchstone('# GHz S RI R 50\n1 0 0 0 0 0 0 0 0'), confirmed);
  assert.equal(metrics.points[0].ilDb, -Infinity);
  assert.equal(compareMeasurement(metrics, mask, evaluate).status, 'measured_exceedance');
  assert.equal(compareMeasurement(metrics, { ...mask, metric: 'S11', comparison: 'max' }, evaluate).status, 'measured_pass');
});
