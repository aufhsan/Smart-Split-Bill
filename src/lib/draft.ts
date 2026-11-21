import type {Item,Cost} from './calc'
export type Draft = {receiptPath:string|null; date?:string; time?:string; merchant:string; receiptTotal:number|null; items:Item[]; costs:Cost[]}
const D='ssb-draft', O='ssb-ocr'
const get = <T>(k:string):T|null => { try { return JSON.parse(sessionStorage.getItem(k)||'null') } catch { return null } }
export const saveDraft = (d:Draft) => sessionStorage.setItem(D, JSON.stringify(d))
export const loadDraft = () => get<Draft>(D)
export const saveOcr = (o:{receiptPath:string|null; ocr:any}) => sessionStorage.setItem(O, JSON.stringify(o))
export const loadOcr = () => get<{receiptPath:string|null; ocr:any}>(O)
export const clearAll = () => { sessionStorage.removeItem(D); sessionStorage.removeItem(O) }
