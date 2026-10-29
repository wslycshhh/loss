import { evaluateMask } from './engine.mjs';

export function compareInsertionBudget(masks, fGHz, allowAdditiveBudget = false) {
  if (!allowAdditiveBudget) return { status:'TBD',reason:'须先确认厂商允许各组件插损预算相加，且参考面无重复。' };
  const selected = ['pcb_tx','cable','pcb_rx','total'].map(component=>masks.find(m=>m.component===component&&m.metric.endsWith('21')));
  if (selected.some(m=>!m)) return {status:'TBD',reason:'缺少完整的 IL 组件预算。'};
  if (new Set(selected.map(m=>m.referenceOhms)).size!==1 || new Set(selected.map(m=>m.metric)).size!==1) return {status:'TBD',reason:'S 参数类型或参考阻抗不同，禁止直接相加。'};
  const values=selected.map(m=>evaluateMask(m,fGHz));
  if(values.some(v=>v.positiveLossDb===null))return {status:'TBD',reason:'查询频点无完整限值，禁止外推。'};
  const componentSumDb=values.slice(0,3).reduce((sum,v)=>sum+v.positiveLossDb,0);
  const totalAllowanceDb=values[3].positiveLossDb;
  return {status:values.every(v=>v.status==='OK')?'budget_only':'pending_source',componentSumDb,totalAllowanceDb,differenceDb:totalAllowanceDb-componentSumDb,reason:'仅核对允许的插损分配，不修改源规范差异，不涉及回损叠加或实测通过。'};
}
