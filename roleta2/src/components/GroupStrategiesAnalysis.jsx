// GroupStrategiesAnalysis.jsx (versão otimizada)
import React, { useMemo } from 'react';
import { Users, TrendingUp, Target, Copy, Rocket } from 'lucide-react';
import styles from './DeepAnalysisPanel.module.css';

const ROULETTE_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const SECTORS = {
  zero: [0, 32, 15, 19, 4, 21, 2, 25],
  voisins: [17, 34, 6, 27, 13, 36, 11, 30, 8],
  tiers: [5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
};

const GroupStrategiesAnalysis = ({ spinHistory }) => {
  const strategiesData = useMemo(() => {
    if (!spinHistory || spinHistory.length < 20) return null;
    return {
      paulista: calcPaulista(spinHistory),
      sevenone: calcSevenOne(spinHistory),
      isolada: calcIsolada(spinHistory),
      clone: calcClone(spinHistory),
      foguete: calcFoguete(spinHistory)
    };
  }, [spinHistory]);

  if (!strategiesData)
    return <div className={styles['loading-state']}>Aguardando pelo menos 20 spins...</div>;

  return (
    <>
      <h3 className={styles['dashboard-title']}>
        Análise de Grupos e Estratégias ({spinHistory.length} spins)
      </h3>
      {Object.entries({
        paulista: ["Análise Paulista", "Setores da Roda Física", <Users />],
        sevenone: ["Seven One", "Proporção 7:1 de Frequência", <TrendingUp />],
        isolada: ["Isolada", "Números Sem Vizinhos Recentes", <Target />],
        clone: ["Clone", "Padrões Repetidos Consecutivos", <Copy />],
        foguete: ["Foguete", "Momentum Ascendente", <Rocket />]
      }).map(([key, [title, subtitle, icon]]) => (
        <StrategyCard key={key} title={title} subtitle={subtitle} icon={icon} data={strategiesData[key]} />
      ))}
    </>
  );
};

const StrategyCard = ({ title, subtitle, icon, data }) => (
  <div className={styles['strategy-card']}>
    <div className={styles['strategy-header']}>
      {icon}
      <div>
        <h4 className={styles['card-title']}>{title}</h4>
        <div className="text-gray-400 text-sm">{subtitle}</div>
      </div>
    </div>
    <div className={styles['analysis-content']}>
      <p>{data.info}</p>
      <table className={styles['analysisTable']}>
        <thead><tr><th>Grupo</th><th>Contagem</th><th>%</th><th>Status</th></tr></thead>
        <tbody>
          {['g1','g2','g3'].map((g,i)=>(
            <tr key={i}>
              <td><b>{g.toUpperCase()}</b></td>
              <td>{data[g]}</td>
              <td>{data[`${g}Percent`]}%</td>
              <td>{getBadge(data[`${g}Temp`])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 border-t border-gray-700 pt-2 flex justify-between">
        <span>Score de Confiança:</span>
        <b>{data.r}/100</b>
      </div>
      <ProgressBar value={data.r} max={100} colorClass={getProgressColor(data.r)} />
      {data.suggestedNumbers?.length>0 && (
        <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-600/40 rounded">
          <b>🎯 Números Sugeridos:</b>
          <div className="flex flex-wrap gap-1 mt-2">
            {data.suggestedNumbers.map((n,i)=>(<NumberChip key={i} number={n}/>))}
          </div>
        </div>
      )}
      {data.recommendation && <p className="italic text-gray-300 mt-2">💡 {data.recommendation}</p>}
    </div>
  </div>
);

const getBadge = t => ({
  hot: <span className={styles['badgeHot']}>QUENTE</span>,
  warm: <span className={styles['badgeWarm']}>MORNO</span>,
  cold: <span className={styles['badgeCold']}>FRIO</span>,
  frozen: <span className={styles['badgeFrozen']}>GELADO</span>,
  normal: <span className={styles['badgeNormal']}>NORMAL</span>
}[t] || <span className={styles['badgeNormal']}>NORMAL</span>);
const getProgressColor = v => v>=80?'gold':v>=60?'green':v>=40?'black':'red';
const NumberChip = ({number}) => {
  const color = number===0?'green':RED_NUMBERS.includes(number)?'red':'black';
  return <span className={`${styles['history-number']} ${styles[color]}`}>{number}</span>;
};
const ProgressBar = ({value,max,colorClass})=>{
  const pct=Math.min((value/max)*100,100);
  return <div className={styles['progress-bar-container']}><div className={`${styles['progress-bar-fill']} ${styles[colorClass]}`} style={{width:`${pct}%`}}>{pct>0&&`${Math.round(pct)}%`}</div></div>;
};

// ======== FUNÇÕES APRIMORADAS ========
const weight=i=>Math.exp(-i/10);
const getNeighbors=(n,d=2)=>{
  const idx=ROULETTE_WHEEL_ORDER.indexOf(n);
  if(idx===-1)return[];
  const arr=[];
  for(let i=-d;i<=d;i++)if(i!==0)arr.push(ROULETTE_WHEEL_ORDER[(idx+i+37)%37]);
  return arr;
};

function calcPaulista(spins){
  const last=spins.slice(0,30);
  const c={zero:0,voisins:0,tiers:0};
  last.forEach(s=>{
    if(SECTORS.zero.includes(s.num))c.zero++;
    else if(SECTORS.voisins.includes(s.num))c.voisins++;
    else if(SECTORS.tiers.includes(s.num))c.tiers++;
  });
  const mean=(c.zero+c.voisins+c.tiers)/3;
  const std=Math.sqrt(((c.zero-mean)**2+(c.voisins-mean)**2+(c.tiers-mean)**2)/3);
  const confidence=Math.min(100,50+std*15);
  const coldest=Object.entries(c).sort((a,b)=>a[1]-b[1])[0][0];
  return{
    g1:c.zero,g2:c.voisins,g3:c.tiers,
    g1Percent:(c.zero/30*100).toFixed(1),g2Percent:(c.voisins/30*100).toFixed(1),g3Percent:(c.tiers/30*100).toFixed(1),
    g1Temp:c.zero>mean?'hot':'cold',g2Temp:c.voisins>mean?'hot':'cold',g3Temp:c.tiers>mean?'hot':'cold',
    r:Math.round(confidence),
    info:`Setores: Zero=${c.zero}, Voisins=${c.voisins}, Tiers=${c.tiers}`,
    suggestedNumbers:SECTORS[coldest].slice(0,8),
    recommendation:`Setor ${coldest} está abaixo da média, chance de compensação próxima.`
  };
}

function calcSevenOne(spins){
  const last=spins.slice(0,40);
  const freq={};for(let i=0;i<=36;i++)freq[i]=last.reduce((a,s,idx)=>a+(s.num===i?weight(idx):0),0);
  const hot=Object.keys(freq).filter(k=>freq[k]>=2.5).map(Number);
  const cold=Object.keys(freq).filter(k=>freq[k]<1).map(Number);
  const ratio=hot.length?cold.length/hot.length:7;
  const confidence=Math.max(0,100-Math.abs(ratio-6.3)*12);
  return{
    g1:hot.length,g2:37-hot.length-cold.length,g3:cold.length,
    g1Percent:(hot.length/37*100).toFixed(1),g2Percent:(((37-hot.length-cold.length)/37)*100).toFixed(1),g3Percent:(cold.length/37*100).toFixed(1),
    g1Temp:'hot',g2Temp:'normal',g3Temp:ratio>6?'cold':'warm',
    r:Math.round(confidence),
    info:`Hot=${hot.length}, Cold=${cold.length}, Proporção ${ratio.toFixed(1)}:1`,
    suggestedNumbers:cold.slice(0,10),
    recommendation:ratio>6?"Proporção alta, provável compensação de frios":"Equilíbrio detectado, mantenha observação"
  };
}

function calcIsolada(spins){
  const last=spins.slice(0,20);const recents=last.map(s=>s.num);
  const iso=[],semi=[],clust=[];const uniq=[...new Set(recents)];
  uniq.forEach(n=>{const neigh=getNeighbors(n,2);const count=neigh.filter(x=>recents.includes(x)).length;
    if(count===0)iso.push(n);else if(count===1)semi.push(n);else clust.push(n);
  });
  const suggested=[...new Set(iso.flatMap(n=>getNeighbors(n,2)))].slice(0,12);
  return{
    g1:iso.length,g2:semi.length,g3:clust.length,
    g1Percent:(iso.length/uniq.length*100).toFixed(1),g2Percent:(semi.length/uniq.length*100).toFixed(1),g3Percent:(clust.length/uniq.length*100).toFixed(1),
    g1Temp:iso.length>=3?'hot':'cold',g2Temp:'normal',g3Temp:clust.length>5?'hot':'normal',
    r:Math.min(100,40+iso.length*10),
    info:`Isolados=${iso.length}, Semi=${semi.length}, Clusters=${clust.length}`,
    suggestedNumbers:suggested,
    recommendation:iso.length>=3?"Buraco frio detectado, aposte vizinhança":"Aguarde mais isolamento"
  };
}

function calcClone(spins){
  const last=spins.slice(0,30);
  let color=0,dozen=0,parity=0,pos=0;let lc=null,ld=null,lp=null;
  for(let i=0;i<last.length;i++){
    const n=last[i].num;const c=n===0?'g':RED_NUMBERS.includes(n)?'r':'b';const d=n===0?0:n<=12?1:n<=24?2:3;const p=n%2;
    if(c===lc&&c!=='g')color++;lc=c; if(d===ld&&d!==0)dozen++;ld=d; if(p===lp&&p!==0)parity++;lp=p;
    if(i>0){const dist=Math.abs(ROULETTE_WHEEL_ORDER.indexOf(n)-ROULETTE_WHEEL_ORDER.indexOf(last[i-1].num));if(dist<=3)pos++;}
  }
  const mix=(color+dozen+parity+pos)/4;const conf=Math.min(100,mix*10);
  return{
    g1:color,g2:dozen,g3:parity,
    g1Percent:(color/29*100).toFixed(1),g2Percent:(dozen/29*100).toFixed(1),g3Percent:(parity/29*100).toFixed(1),
    g1Temp:color>6?'hot':'normal',g2Temp:dozen>6?'hot':'normal',g3Temp:parity>6?'hot':'normal',
    r:Math.round(conf),
    info:`Cor=${color}, Dúzia=${dozen}, Paridade=${parity}, Posicional=${pos}`,
    suggestedNumbers:[],
    recommendation:mix>6?"Clone contínuo detectado":"Padrão misto, reversão possível"
  };
}

function calcFoguete(spins){
  const r20=spins.slice(0,20),p20=spins.slice(20,40);
  const rf={},pf={};for(let i=0;i<=36;i++){rf[i]=r20.filter(s=>s.num===i).length;pf[i]=p20.filter(s=>s.num===i).length;}
  const asc=[],st=[],desc=[];for(let i=0;i<=36;i++){const diff=rf[i]-pf[i];if(diff>0)asc.push(i);else if(diff===0)st.push(i);else desc.push(i);}
  const acc=asc.map(i=>(rf[i]-pf[i])/(pf[i]+1));const avg=acc.reduce((a,b)=>a+b,0)/(acc.length||1);
  const conf=Math.min(100,50+avg*30);
  asc.sort((a,b)=>acc[b]-acc[a]);
  return{
    g1:asc.length,g2:st.length,g3:desc.length,
    g1Percent:(asc.length/37*100).toFixed(1),g2Percent:(st.length/37*100).toFixed(1),g3Percent:(desc.length/37*100).toFixed(1),
    g1Temp:asc.length>15?'hot':'warm',g2Temp:'normal',g3Temp:desc.length>20?'cold':'normal',
    r:Math.round(conf),
    info:`Alta=${asc.length}, Estáveis=${st.length}, Queda=${desc.length}, Aceleração média=${avg.toFixed(2)}`,
    suggestedNumbers:asc.slice(0,10),
    recommendation:avg>1?"Números em forte ascensão 🚀":"Momentum fraco, aguarde"
  };
}

export default GroupStrategiesAnalysis;
