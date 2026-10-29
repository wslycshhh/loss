// Touchstone v1 ordering: IBIS specification, pages 13 and 15–16.
// https://www.ibis.org/touchstone_ver2.0/touchstone_ver2_0.pdf
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const UNITS = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 };

function number(token, line) {
  const value = NUMBER.test(token) ? Number(token) : NaN;
  if (!Number.isFinite(value)) throw new Error(`Line ${line}: invalid numeric value ${token}.`);
  return value;
}

export function parseTouchstone(text, portCount = 2) {
  if (typeof text !== 'string') throw new Error('Touchstone input must be text.');
  if (portCount !== 2 && portCount !== 4) throw new Error('Only .s2p and .s4p files are supported.');
  let options;
  let pending = [];
  const points = [];
  const recordLength = 1 + 2 * portCount ** 2;
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].split('!')[0].trim();
    if (!line) continue;
    if (line.includes('[') || line.includes(']')) {
      throw new Error(`Line ${lineNumber}: Touchstone v2 keywords/mixed-mode/noise blocks are unsupported; use v1 single-ended data.`);
    }
    if (line.startsWith('#')) {
      if (options) throw new Error(`Line ${lineNumber}: repeated option lines are unsupported.`);
      options = { unit: 'GHZ', format: 'MA', referenceOhms: 50 };
      const seen = new Set();
      const tokens = line.slice(1).trim().toUpperCase().split(/\s+/).filter(Boolean);
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const kind = Object.hasOwn(UNITS, token) ? 'unit'
          : ['RI', 'MA', 'DB'].includes(token) ? 'format'
          : token === 'S' ? 'parameter' : token === 'R' ? 'referenceOhms' : null;
        if (!kind || seen.has(kind)) throw new Error(`Line ${lineNumber}: unsupported or repeated option ${token}.`);
        seen.add(kind);
        if (kind === 'referenceOhms') {
          options.referenceOhms = number(tokens[++i] ?? '', lineNumber);
          if (options.referenceOhms <= 0) throw new Error(`Line ${lineNumber}: reference resistance must be positive.`);
        } else if (kind !== 'parameter') options[kind] = token;
      }
      continue;
    }
    if (!options) throw new Error(`Line ${lineNumber}: the option line must precede network data.`);
    const values = line.split(/\s+/).map(token => number(token, lineNumber));
    // A new record starts with frequency; folded lines contain complete complex pairs.
    if (values.length % 2 !== (pending.length === 0 ? 1 : 0)) {
      throw new Error(`Line ${lineNumber}: incomplete complex pairs or unsupported noise data.`);
    }
    pending.push(...values);
    if (pending.length > recordLength) throw new Error(`Line ${lineNumber}: too many values; unsupported noise data or malformed frequency record.`);
    if (pending.length !== recordLength) continue;
    const frequencyHz = pending[0] * UNITS[options.unit];
    if (!Number.isFinite(frequencyHz) || frequencyHz < 0 || (points.length && frequencyHz <= points.at(-1).frequencyHz)) {
      throw new Error(`Line ${lineNumber}: frequencies must be finite, nonnegative and strictly increasing; noise data is unsupported.`);
    }
    const s = Array.from({ length: portCount }, () => Array(portCount));
    for (let pair = 0; pair < portCount ** 2; pair++) {
      const first = pending[1 + pair * 2];
      const second = pending[2 + pair * 2];
      let re = first;
      let im = second;
      if (options.format !== 'RI') {
        if (options.format === 'MA' && first < 0) throw new Error(`Line ${lineNumber}: MA magnitude must be nonnegative.`);
        const magnitude = options.format === 'DB' ? 10 ** (first / 20) : first;
        const angle = second * (Math.PI / 180);
        re = magnitude * Math.cos(angle);
        im = magnitude * Math.sin(angle);
      }
      if (!Number.isFinite(re) || !Number.isFinite(im)) throw new Error(`Line ${lineNumber}: complex value exceeds numeric range.`);
      // Two-port is the historical exception; >=3 ports use row-wise matrix order.
      const row = portCount === 2 ? pair % 2 : Math.floor(pair / portCount);
      const column = portCount === 2 ? Math.floor(pair / 2) : pair % portCount;
      s[row][column] = { re, im };
    }
    points.push({ frequencyHz, s });
    pending = [];
  }
  if (!options || !points.length || pending.length) throw new Error('Missing or incomplete network data; noise data is unsupported.');
  return { portCount, referenceOhms: options.referenceOhms, points };
}

export function deriveMetrics(parsed, {
  inputPlus = 1, inputMinus, outputPlus = 2, outputMinus, mappingConfirmed = false, referencePlane,
} = {}) {
  if (mappingConfirmed !== true) throw new Error('Confirm the physical port mapping before deriving metrics.');
  if (typeof referencePlane !== 'string' || !referencePlane.trim()) throw new Error('Confirm a named measurement reference plane.');
  if (parsed.referenceOhms !== 50) throw new Error('Only 50 ohm single-ended source data is supported; impedance renormalization is not implemented.');
  const differential = parsed.portCount === 4;
  const ports = differential ? [inputPlus, inputMinus, outputPlus, outputMinus] : [inputPlus, outputPlus];
  if (!ports.every(port => Number.isInteger(port) && port >= 1 && port <= parsed.portCount) || new Set(ports).size !== ports.length) {
    throw new Error('Confirm distinct valid input/output port numbers and differential polarities.');
  }
  const points = parsed.points.map(({ frequencyHz, s }) => {
    const ip = inputPlus - 1;
    const op = outputPlus - 1;
    let transmission = s[op][ip];
    let reflection = s[ip][ip];
    if (differential) {
      const im = inputMinus - 1;
      const om = outputMinus - 1;
      const combine = (a, b, c, d) => ({ re: (a.re - b.re - c.re + d.re) / 2, im: (a.im - b.im - c.im + d.im) / 2 });
      transmission = combine(s[op][ip], s[op][im], s[om][ip], s[om][im]);
      reflection = combine(s[ip][ip], s[ip][im], s[im][ip], s[im][im]);
    }
    return {
      fGHz: frequencyHz / 1e9,
      ilDb: 20 * Math.log10(Math.hypot(transmission.re, transmission.im)),
      rlDb: 20 * Math.log10(Math.hypot(reflection.re, reflection.im)),
    };
  });
  return { referencePlane: referencePlane.trim(), referenceOhms: differential ? 100 : 50, metricFamily: differential ? 'differential' : 'single_ended', points };
}

export function compareMeasurement(metrics, mask, evaluateMask) {
  const result = { status: 'TBD', points: [], worstMarginDb: null, warning: 'Only measured source points are compared; this does not establish compliance between points or across the whole curve.' };
  const family = mask?.metric?.startsWith('Sdd') ? 'differential' : 'single_ended';
  if (!mask || !['S21', 'Sdd21', 'S11', 'Sdd11'].includes(mask.metric) || !['min', 'max'].includes(mask.comparison)) {
    return { ...result, reason: 'No supported mask is selected.' };
  }
  if (!metrics.referencePlane || metrics.referencePlane !== mask.referencePlane || metrics.referenceOhms !== mask.referenceOhms) {
    return { ...result, reason: 'Measurement and mask reference planes and impedances must explicitly match.' };
  }
  if (metrics.metricFamily !== family) return { ...result, reason: 'Single-ended and differential metrics must not be mixed.' };
  if (typeof evaluateMask !== 'function') throw new Error('A mask evaluator is required.');
  const field = ['S21', 'Sdd21'].includes(mask.metric) ? 'ilDb' : 'rlDb';
  for (const point of metrics.points) {
    const evaluated = evaluateMask(mask, point.fGHz);
    const measuredDb = point[field];
    if (!['OK','TBD'].includes(evaluated.status) || !Number.isFinite(evaluated.signedDb) || !(Number.isFinite(measuredDb) || measuredDb === -Infinity)) {
      result.points.push({ fGHz: point.fGHz, measuredDb, maskDb: null, marginDb: null, status: 'TBD' });
      continue;
    }
    const marginDb = mask.comparison === 'min' ? measuredDb - evaluated.signedDb : evaluated.signedDb - measuredDb;
    const status = mask.verificationStatus !== 'verified_public' || evaluated.status !== 'OK' ? 'TBD' : marginDb < 0 ? 'measured_exceedance' : 'measured_pass';
    result.points.push({ fGHz: point.fGHz, measuredDb, maskDb: evaluated.signedDb, marginDb, status });
    result.worstMarginDb = result.worstMarginDb === null ? marginDb : Math.min(result.worstMarginDb, marginDb);
  }
  if (mask.verificationStatus !== 'verified_public') return { ...result, reason: 'The mask is not verified public data; numerical comparisons cannot establish compliance.' };
  if (result.points.some(point => point.status === 'measured_exceedance')) result.status = 'measured_exceedance';
  else if (result.points.length && result.points.every(point => point.status === 'measured_pass')) result.status = 'measured_pass';
  else result.reason = 'One or more source points have no valid in-band mask comparison.';
  return result;
}
