#!/usr/bin/env python3
"""Headless reachability model, NOT production game. Python 3 stdlib only.
Fixed purchase policy; all actions cost actual coins/seeds. No time-based grants.
"""
import argparse, json
from pathlib import Path
from fractions import Fraction
from collections import Counter
from math import isclose
ROOT=Path(__file__).resolve().parents[1]
B=json.loads((ROOT/'config/balance.json').read_text())
W=json.loads((ROOT/'config/island.json').read_text())
P={p['id']:p for p in B['plants']}; R=B['recipes']; DT=.25

def adjacent(i):
    return [j for j in (i-1 if i%4 else -1,i+1 if i%4<3 else -1,i-4 if i>=4 else -1,i+4 if i<12 else -1) if j>=0]

class Garden:
    def __init__(self):
        self.time=0.; self.coins=B['startCoins']; self.open=set(W['startOpen']); self.plants={}; self.levels=[1]*16
        self.seeds=Counter(); self.progress=Counter(); self.revealed=set(); self.planted=set(); self.basket=[]; self.basket_level=0
        self.helper=0; self.auto=False; self.next_harvest=float('inf'); self.next_sale=float('inf'); self.events={}; self.sold=False
        self.nursery = []
        for p in W['startPlants']: self.add_plant(p['plot'],p['species'])
    def mark(self,name): self.events.setdefault(name,self.time)
    def add_plant(self,i,s):
        assert i in self.open and i not in self.plants
        self.plants[i]={'species':s,'growth':0.,'ready':None,'prop':0}; self.planted.add(s); self.mark('plant:'+s)
    def capacity(self): return B['basketLevels'][self.basket_level]['capacity']
    def aura(self,i,kind):
        s=self.plants[i]['species']; ns={self.plants[j]['species'] for j in adjacent(i) if j in self.plants}
        return max([0]+[a['bonus'] for a in B['auras'] if a['source'] in ns and a['kind']==kind and (a['targets']=='all' or (a['targets']=='hybrids' and P[s]['generation']>0) or (isinstance(a['targets'],list) and s in a['targets']))])
    def sell(self):
        if not self.basket:return
        self.coins+=(sum(self.basket)+5000)//10000; self.basket=[]; self.sold=True; self.mark('first_sale')
        if self.auto:self.next_sale=self.time+B['autoSell']['intervalSec']
    def collect(self,i):
        p=self.plants[i]; s=p['species']
        if p['ready'] is None or len(self.basket)>=self.capacity():return False
        mult=Fraction(str(B['bedLevels'][self.levels[i]-1]['priceMultiplier']))*(1+Fraction(str(self.aura(i,'price'))))
        value=P[s]['fruitValue']*mult*10000; assert value.denominator==1
        self.basket.append(int(value)); p['growth']=0.; p['ready']=None; self.mark('first_harvest')
        ns={self.plants[j]['species'] for j in adjacent(i) if j in self.plants}
        for r in R:
            out=r['result']
            if out not in self.revealed and s==r['primary'] and self.levels[i]>=r['minBedLevel'] and set(r['neighbors'])<=ns:
                self.progress[out]+=1
                if self.progress[out]>=r['harvests']:
                    self.revealed.add(out); self.seeds[out]+=1; self.mark('reveal:'+out)
        if P[s]['generation']:
            p['prop']+=1+int(self.aura(i,'propagation')); threshold=P[s]['propagationThreshold']
            while p['prop']>=threshold:
                p['prop']-=threshold; self.seeds[s]+=1; self.mark('first_propagation')
        if self.auto and len(self.basket)==self.capacity():self.sell()
        return True
    def step(self):
        self.time+=DT
        for i,p in self.plants.items():
            if p['ready'] is None:
                p['growth']+=DT/P[p['species']]['cycleSec']*B['bedLevels'][self.levels[i]-1]['growthMultiplier']*(1+self.aura(i,'growth'))
                if p['growth']>=1-1e-10:p['growth']=1.;p['ready']=self.time
        if self.time>=self.next_harvest:
            ready=[(p['ready'],i) for i,p in self.plants.items() if p['ready'] is not None]
            if ready:self.collect(min(ready)[1])
            self.next_harvest=self.time+B['helperLevels'][self.helper]['intervalSec']
        if self.auto and self.time>=self.next_sale:
            self.sell(); self.next_sale=self.time+B['autoSell']['intervalSec']
    def spend(self,n):
        if self.coins<n:return False
        self.coins-=n;return True
    def allowed(self,s):
        if s in ['radish','strawberry']:return True
        if s in ['sunflower','blueberry']:return 'strawberry' in self.planted
        if s=='moonflower':return 'blueberry' in self.planted
        if s=='clover':return bool(self.revealed)
        return self.seeds[s]>0
    def buy(self,action):
        kind,*args=action
        if kind=='clear':
            i=args[0]
            if i in self.open:return True
            if not self.sold or not any(j in self.open for j in adjacent(i)):return False
            if not self.spend(B['expansionCosts'][len(self.open)-4]):return False
            self.open.add(i); self.mark('plots:'+str(len(self.open)));return True
        if kind in ('plant','replace'):
            i,s=args
            if i not in self.open or not self.allowed(s):return False
            if kind=='replace':
                if i not in self.plants:return False
                if not self.revealed and len(self.plants)!=len(self.levels):return False
            elif i in self.plants:return False
            if P[s]['generation']:self.seeds[s]-=1
            elif not self.spend(P[s]['seedPrice']):return False
            if kind=='replace':self.nursery.append(self.plants.pop(i))
            self.add_plant(i,s);return True
        if kind=='bed':
            i,target=args
            if i not in self.open:return False
            if self.levels[i]>=target:return True
            assert target==self.levels[i]+1
            if not self.spend(B['bedLevels'][target-1]['upgradeCost']):return False
            self.levels[i]=target;self.mark(f'bed:{i}:{target}');return True
        if kind=='helper':
            target=args[0]
            if not self.sold:return False
            assert target==self.helper+1
            if not self.spend(B['helperLevels'][target]['upgradeCost']):return False
            self.helper=target;self.next_harvest=self.time+B['helperLevels'][target]['intervalSec'];self.mark('helper:'+str(target));return True
        if kind=='auto':
            if not self.helper or not self.spend(B['autoSell']['cost']):return False
            self.auto=True;self.next_sale=self.time+B['autoSell']['intervalSec'];self.mark('auto_sell');return True
        if kind=='basket':
            if not self.sold or not self.spend(B['basketLevels'][self.basket_level+1]['upgradeCost']):return False
            self.basket_level+=1;return True
        raise ValueError(action)

# Orthogonal witnesses:
# 4 moonflower, 5 blueberry, 6 moonberry (II), 7 golden flower
# 8 strawberry, 9 sunflower, 10 clover, 11 honey clover
# 12 radish, 13 radish, 14 solar strawberry, 15 crystal flower (III)
# Final orchid planted in 0, remaining 1..3 opened; no replacement needed.
POLICY=[('plant',8,'strawberry'),('plant',9,'sunflower'),('clear',14),('helper',1),('plant',14,'solar_strawberry'),('clear',5),('plant',5,'blueberry'),('clear',4),('plant',4,'moonflower'),('auto',),('clear',10),('plant',10,'clover'),('clear',6),('plant',6,'moonberry'),('clear',7),('plant',7,'golden_flower'),('bed',6,2),('clear',11),('plant',11,'honey_clover'),('helper',2),('clear',15),('plant',15,'crystal_flower'),('bed',15,2),('bed',15,3),('clear',0),('plant',0,'star_orchid'),('clear',1),('plant',1,'strawberry'),('clear',2),('plant',2,'strawberry'),('clear',3)]

def run(before,after,limit=3600,policy=POLICY):
    g=Garden(); q=policy.copy(); next_manual=before
    while g.time<limit:
        g.step()
        if g.time>=next_manual:
            for i in sorted(g.plants):
                # Manual player sells a full basket before collecting more.
                if len(g.basket)>=g.capacity():g.sell()
                g.collect(i)
            if not g.auto:g.sell()
            next_manual=g.time+(after if g.auto else before)
        while q and g.buy(q[0]):q.pop(0)
        if len(g.planted)==12:g.mark('collection')
        if len(g.planted)==12 and len(g.open)==16:
            g.mark('complete')
        if not q:break
    assert g.coins>=0 and all(v>=0 for v in g.seeds.values()) and len(g.basket)<=g.capacity()
    return g,q

def fmt(t):
    if t is None:return '—'
    sec=int(t+.5);return f'{sec//60:02d}:{sec%60:02d}'

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--limit',type=int,default=3600);a=ap.parse_args()
    scenarios=[(3,10),(6,20),(10,30),(3,60),(6,10**9)]
    keys=['first_harvest','first_sale','plant:strawberry','plots:5','reveal:solar_strawberry','helper:1','auto_sell','reveal:moonberry','reveal:honey_clover','reveal:golden_flower','reveal:crystal_flower','reveal:star_orchid','collection','plots:16','complete']
    print('event | '+' | '.join(f'{b}/{c if c<1e8 else "none"} s' for b,c in scenarios))
    runs=[run(b,c,a.limit) for b,c in scenarios]
    for k in keys:print(k+' | '+' | '.join(fmt(g.events.get(k)) for g,q in runs))
    for (b,c),(g,q) in zip(scenarios,runs): print(f'{b}/{c}: coins={g.coins}, species={len(g.planted)}, plots={len(g.open)}, remaining_actions={len(q)}')
    # Follow a connected expansion route and fill every plot before the first recipe.
    full = [('plant', 8, 'radish'), ('plant', 9, 'radish')]
    for plot in (4, 5, 0, 1, 2, 3, 6, 7, 10, 11, 14, 15):
        full.extend([('clear', plot), ('plant', plot, 'radish')])
    full.extend([('replace', 8, 'strawberry'), ('replace', 9, 'sunflower'),
                 ('replace', 12, 'solar_strawberry')])
    garden, pending = run(6, 20, a.limit, full)
    print(f'SL-01: open={len(garden.open)}, stored={len(garden.nursery)}, '
          f'sunberry_planted={"solar_strawberry" in garden.planted}, remaining_actions={len(pending)}')
