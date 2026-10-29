import { validateRulePack } from './engine.mjs';

// Legacy local attachments are translated as data only. Formula strings are never executed.
export function importRules(raw, existingRules = []) {
  if (raw.schemaVersion === 1) return validateRulePack(raw, existingRules);
  const object = (value, keys, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label}: expected object`);
    for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(`${label}: unknown field ${key}`);
  };
  const number = (value, label) => {
    if (!Number.isFinite(value)) throw new TypeError(`${label}: expected finite number`);
  };
  const range = (value) => {
    if (!Array.isArray(value) || value.length !== 2) throw new TypeError('Invalid frequency range');
    value.forEach(v => number(v, 'frequency'));
    if (value[0] <= 0 || value[1] < value[0]) throw new TypeError('Invalid frequency bounds');
  };
  const coeff = (value) => {
    if (!Array.isArray(value) || value.length !== 3) throw new TypeError('Expected three polynomial coefficients');
    value.forEach(v => number(v, 'coefficient'));
  };
  object(raw, ['id','schemaVersion','distribution','supplier','protocol','source','scope','rateRule','signedDbConvention','testPlanes','insertionLoss','returnLoss','expectedIndependentChecks','nonMaskNotes','publicationPolicy'], 'attachment');
  if (raw.schemaVersion !== '1.0-private-draft' || typeof raw.id !== 'string') throw new TypeError('Unsupported local attachment schema');
  object(raw.source, ['documentTitle','revision','visibility','origin','copyrightAndPermissionNote','reviewStatus'], 'source');
  object(raw.scope, ['supportedChipPairsFromPage4','applicableModes','listedForwardRateGbps','formulaMaskClassesAvailableGbps','intermediateRateClassSelection','nyquistForNRZGHz'], 'scope');
  object(raw.rateRule, ['applicability','frameBitsChoices','legacyPage3Formula','correctedForUserSinglePhysicalLink','outputUnit','physicalHighSpeedLinkCount','correctionBasis','verificationStatus','doNotConfuseWith','notes'], 'rateRule');
  object(raw.signedDbConvention, ['insertionLoss','returnLoss','frequencyUnit','coefficientOrder','expression','linearExpression'], 'convention');
  object(raw.testPlanes, ['total','pcb_tx','cable_assembly','pcb_rx','note'], 'testPlanes');
  object(raw.publicationPolicy, ['publicGitHub','publicNpmOrStaticAssets','privateLocalImport','testDesign'], 'policy');
  if (raw.signedDbConvention.frequencyUnit !== 'MHz' || raw.rateRule.physicalHighSpeedLinkCount !== 1) throw new TypeError('Unsupported clock, frequency or physical-link convention');
  if (JSON.stringify(raw.signedDbConvention.coefficientOrder) !== JSON.stringify(['quadratic','linear','constant'])) throw new TypeError('Unsupported coefficient order');
  if (!Array.isArray(raw.scope.supportedChipPairsFromPage4) || !Array.isArray(raw.rateRule.frameBitsChoices) || !Array.isArray(raw.insertionLoss) || !Array.isArray(raw.returnLoss)) throw new TypeError('Missing rule arrays');
  for (const check of raw.expectedIndependentChecks ?? []) {
    object(check, ['medium','classGbps','fMHz','totalSignedDb','harnessSignedDb','eachPcbSignedDb','sumMatches','discrepancySignedDb'], 'reference check');
  }
  for (const item of raw.insertionLoss) {
    object(item, ['medium','maskClassGbps','component','fMHz','coeff','page'], 'insertion loss');
    range(item.fMHz); coeff(item.coeff);
  }
  for (const item of raw.returnLoss) {
    object(item, ['medium','sourcePage','reportedApplicability','sParameterSignedDb','segments'], 'return loss');
    if (!Array.isArray(item.segments)) throw new TypeError('Missing reflection segments');
    for (const seg of item.segments) { object(seg, ['fMHz','coeff'], 'segment'); range(seg.fMHz); coeff(seg.coeff); }
  }
  const source = {
    title: raw.source.documentTitle, revision: raw.source.revision,
    url: '', section: 'Local authorized attachment', checkedAt: new Date().toISOString().slice(0, 10), visibility: 'restricted',
  };
  const converted = (seg) => ({ rangeGHz: seg.fMHz.map(v => v / 1000), coefficients: [seg.coeff[0] * 1e6, seg.coeff[1] * 1000, seg.coeff[2]] });
  const rules = [];
  for (const pair of raw.scope.supportedChipPairsFromPage4) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(v => typeof v !== 'string')) throw new TypeError('Invalid chip pair');
    for (const frameBits of raw.rateRule.frameBitsChoices) {
      number(frameBits, 'frameBits');
      for (const medium of ['STP', 'Coax']) {
        for (const maskClass of raw.scope.formulaMaskClassesAvailableGbps) {
          number(maskClass, 'mask class');
          const masks = [];
          const components = { total: ['total'], cable_assembly: ['cable'], pcb_tx_and_pcb_rx_independently: ['pcb_tx','pcb_rx'] };
          for (const item of raw.insertionLoss.filter(i => i.medium === medium && (Array.isArray(i.maskClassGbps) ? i.maskClassGbps.includes(maskClass) : i.maskClassGbps === maskClass))) {
            if (!components[item.component]) throw new TypeError('Unknown component');
            for (const component of components[item.component]) {
              masks.push({ component, metric: medium === 'STP' ? 'Sdd21' : 'S21', comparison: 'min', referencePlane: raw.testPlanes[component === 'cable' ? 'cable_assembly' : component], referenceOhms: medium === 'STP' ? 100 : 50, segments: [converted(item)], verificationStatus: 'pending_vendor', source: { ...source, section: `Local page ${item.page}` } });
            }
          }
          for (const item of raw.returnLoss.filter(i => i.medium === medium)) {
            for (const name of item.reportedApplicability) {
              const component = name === 'cable_assembly' ? 'cable' : name;
              if (!['total','cable','pcb_tx','pcb_rx'].includes(component)) throw new TypeError('Unknown reflection component');
              masks.push({ component, metric: medium === 'STP' ? 'Sdd11' : 'S11', comparison: 'max', referencePlane: raw.testPlanes[name], referenceOhms: medium === 'STP' ? 100 : 50, segments: item.segments.map(converted), verificationStatus: 'pending_vendor', source: { ...source, section: `Local page ${item.sourcePage}` } });
            }
          }
          rules.push({
            ruleId: `${raw.id}:${pair.join('-')}:${frameBits}:${medium}:${maskClass}`,
            vendor: raw.supplier, serializer: pair[0], deserializer: pair[1], direction: 'display', media: [medium], physicalLinkCounts: [1],
            verificationStatus: String(raw.rateRule.verificationStatus).startsWith('user_confirmed_vendor') ? 'user_confirmed_vendor' : 'pending_vendor', source,
            rate: { kind: 'frame', frameBits, modulation: 'NRZ', pixelsPerClockSupported: [1] },
            lossMasks: masks,
            notes: [`内部导入 · ${frameBits} bit · ${maskClass} Gbps 掩码档位（须人工选择适用档位）`, '限值为待复核抄录；不可用于正式合格判定。', raw.rateRule.applicability, ...raw.nonMaskNotes ?? []],
          });
        }
      }
    }
  }
  return validateRulePack({ schemaVersion: 1, packId: raw.id, rules }, existingRules);
}
