import test from 'node:test';
import assert from 'node:assert/strict';
import { importRules } from '../src/import-rules.mjs';
import { interpolate, estimateHarness } from '../src/harness.mjs';
import { cables } from '../src/catalog.mjs';
import { compareInsertionBudget } from '../src/budget.mjs';
import { calculateRate } from '../src/engine.mjs';
import { publicRules } from '../src/catalog.mjs';

test('published cable reference example uses in-range interpolation and explicit mating assumptions', () => {
  const options = { fGHz:2.5,lengthM:3,inlineBreakCount:1,connectorMinDb:0,connectorMaxDb:0.5,connectorMaxGHz:3,allowanceDb:6,referencePlaneConfirmed:true };
  const result = cables.map(c=>estimateHarness(c,options));
  for (const [i,value] of [2.376,4.575,5.25].entries()) assert.ok(Math.abs(result[i].bareCableDb-value)<1e-9);
  assert.ok(Math.abs(result[0].maxDb-3.876)<1e-9);
  assert.ok(Math.abs(result[1].maxDb-6.075)<1e-9);
  assert.equal(result[2].maxDb,6.75);
  assert.equal(result[1].risk,'接近边界 / 不确定');
  assert.match(result[2].rl,/不叠加回损/);
});

test('missing reference agreement, out-of-range data and connector assumptions cannot yield margins', () => {
  const settings = { fGHz:2.5,lengthM:3,inlineBreakCount:1,connectorMinDb:0,connectorMaxDb:0.5,connectorMaxGHz:3,allowanceDb:6 };
  assert.equal(estimateHarness(cables[0],settings).marginDb,null);
  assert.equal(estimateHarness(cables[0],{...settings,fGHz:8}).status,'TBD');
  assert.equal(estimateHarness(cables[0],{...settings,fGHz:3.5}).status,'TBD');
  assert.equal(interpolate([{fGHz:0.1,dbPerM:0.2},{fGHz:0.6,dbPerM:0.4}],2.5),null);
  assert.throws(()=>estimateHarness(cables[0],{...settings,lengthM:31}),RangeError);
});

test('local attachment import uses numeric data, never expression strings, and rejects unknown fields', () => {
  const raw = {
    id:'synthetic-private-adapter',schemaVersion:'1.0-private-draft',distribution:'synthetic-test',supplier:'Synthetic',protocol:'Demo',
    source:{documentTitle:'Synthetic fixture',revision:'1',visibility:'restricted',origin:'test',copyrightAndPermissionNote:'test',reviewStatus:'pending'},
    scope:{supportedChipPairsFromPage4:[['Example SER','Example DES']],applicableModes:[],listedForwardRateGbps:[],formulaMaskClassesAvailableGbps:[9]},
    rateRule:{frameBitsChoices:[29],physicalHighSpeedLinkCount:1,verificationStatus:'user_confirmed_vendor',applicability:'Synthetic arithmetic only'},
    signedDbConvention:{frequencyUnit:'MHz',coefficientOrder:['quadratic','linear','constant']},testPlanes:{total:'A-D',pcb_tx:'A-B',cable_assembly:'B-C',pcb_rx:'C-D'},
    insertionLoss:[{medium:'STP',maskClassGbps:9,component:'total',fMHz:[10,2100],coeff:[0,-0.0027,-0.47],page:1}],returnLoss:[],expectedIndependentChecks:[],nonMaskNotes:[],publicationPolicy:{},
  };
  const pack=importRules(raw);
  assert.ok(pack.rules.every(r=>r.source.visibility==='restricted'));
  assert.equal(pack.rules[0].lossMasks[0].segments[0].coefficients[1],-2.7);
  assert.throws(()=>importRules({...raw,run:'alert(1)'}),/unknown field/);
  assert.throws(()=>importRules({...raw,insertionLoss:[{...raw.insertionLoss[0],coeff:['alert(1)',0,0]}]}),/finite/);
  assert.throws(()=>importRules(raw,pack.rules),/duplicate/);
  assert.throws(()=>importRules({...raw,signedDbConvention:{...raw.signedDbConvention,coefficientOrder:['constant','linear','quadratic']}}),/coefficient order/);
});

test('IL budget requires an explicit additive convention and never sums reflection',()=>{
  const masks=['pcb_tx','cable','pcb_rx','total'].map((component,i)=>({component,metric:'S21',comparison:'min',referencePlane:component,referenceOhms:50,segments:[{rangeGHz:[0.1,4],coefficients:[0,0,-[1,4,3,8][i]]}],verificationStatus:'verified_public'}));
  assert.equal(compareInsertionBudget(masks,1).status,'TBD');
  assert.equal(compareInsertionBudget(masks,1,true).differenceDb,0);
  assert.equal(compareInsertionBudget(masks.map(m=>({...m,metric:'S11'})),1,true).status,'TBD');
  assert.equal(compareInsertionBudget(masks,5,true).status,'TBD');
});

test('uncompressed frame capacity must cover each clock even with a small active image',()=>{
  const rule=publicRules.find(r=>r.ruleId==='ti-947-948-1link');
  const result=calculateRate({pclkMode:'spec',pclkMHz:50,width:100,height:100,refreshHz:30,bitsPerPixel:48},rule);
  assert.equal(result.status,'Unsupported');
  assert.ok(result.warnings.some(w=>w.includes('frame capacity')));
});
