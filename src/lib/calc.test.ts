import {describe,it,expect} from 'vitest'
import {alloc,compute,payStatus,Cost} from './calc'
const cost = (o:Partial<Cost>):Cost => ({id:'c',kind:'tax',name:'x',percent:null,amount:null,method:'proportional',...o})
describe('alloc', () => it('jumlah selalu sama dengan total', () => {
  const r = alloc(100, [1,1,1]); expect(r.reduce((a,b)=>a+b)).toBe(100); expect(r.sort()).toEqual([33,33,34]) }))
describe('compute', () => {
  it('es teh: Aufa 2, Andi 1 dari Rp15.000', () => {
    const r = compute(['a','b'], [{id:'i',name:'Es teh',total:15000}],
      [{itemId:'i',pid:'a',qty:2},{itemId:'i',pid:'b',qty:1}], [])
    expect(r.persons.map(p=>p.subtotal)).toEqual([10000,5000]) })
  const items = [{id:'1',name:'A',total:200000},{id:'2',name:'B',total:30000},{id:'3',name:'C',total:70000}]
  const asgs = ['a','b','c'].map((p,i)=>({itemId:String(i+1),pid:p,qty:1}))
  it('PPN 10% + service 5% (contoh dokumen)', () => {
    const r = compute(['a','b','c'], items, asgs, [cost({id:'t',percent:10}), cost({id:'s',kind:'service',percent:5})])
    expect(r.persons.map(p=>p.total)).toEqual([230000,34500,80500]); expect(r.grand).toBe(345000) })
  it('diskon nominal Rp30.000 proporsional', () => {
    const r = compute(['a','b','c'], items, asgs, [cost({id:'d',kind:'discount',amount:30000})])
    expect(r.persons.map(p=>p.parts.d)).toEqual([20000,3000,7000]) })
  it('nominal struk jadi acuan dan selisih tampil', () => {
    const r = compute(['a','b','c'], items, asgs, [cost({id:'t',percent:10,amount:30001})])
    expect(r.costRows[0].diff).toBe(1); expect(r.grand).toBe(330001) })
  it('biaya nominal tanpa persen dibagi rata', () => {
    const r = compute(['a','b','c'], items, asgs, [cost({id:'o',kind:'other',amount:15000,method:'equal'})])
    expect(r.persons.map(p=>p.parts.o)).toEqual([5000,5000,5000]) })
})
describe('payStatus', () => it('status, sisa, dan kelebihan bayar', () => {
  expect(payStatus(25000,0).status).toBe('Belum Bayar')
  expect(payStatus(25000,10000)).toEqual({status:'Dibayar Sebagian',sisa:15000,lebih:0})
  expect(payStatus(25000,30000)).toEqual({status:'Lunas',sisa:0,lebih:5000}) }))
