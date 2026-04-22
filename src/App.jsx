import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

const CATEGORIES = [
  { id: "housing", label: "Housing", color: "#e07a8b", icon: "⌂" },
  { id: "food", label: "Food & Dining", color: "#d4976a", icon: "◉" },
  { id: "transport", label: "Transport", color: "#c9b455", icon: "▷" },
  { id: "utilities", label: "Utilities", color: "#6bc99b", icon: "⚡" },
  { id: "shopping", label: "Shopping", color: "#5eb3d4", icon: "◆" },
  { id: "health", label: "Health", color: "#9b8fd4", icon: "+" },
  { id: "entertainment", label: "Entertainment", color: "#d47eb0", icon: "★" },
  { id: "subscriptions", label: "Subscriptions", color: "#a98bd4", icon: "↻" },
  { id: "savings", label: "Savings", color: "#4dbba8", icon: "▲" },
  { id: "pets", label: "Pets", color: "#d47a8b", icon: "♥" },
  { id: "personal", label: "Personal", color: "#c47ad4", icon: "◎" },
  { id: "other", label: "Other", color: "#8891a8", icon: "…" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => {
  if (n == null) return "$0";
  const abs = Math.abs(n);
  return (n < 0 ? "-" : "") + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtShort = (n) => n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + n.toFixed(0);
const todayStr = () => new Date().toISOString().split("T")[0];
const getMonth = (s) => new Date(s + "T00:00:00").getMonth();
const getYear = (s) => new Date(s + "T00:00:00").getFullYear();
const currentMonth = new Date().getMonth();
const currentYear = new Date().getFullYear();

async function load(key, fb) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fb; } catch { return fb; } }
async function save(key, v) { try { await window.storage.set(key, JSON.stringify(v)); } catch(e) { console.error(e); } }

function parseChaseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const hdr = lines[0].toLowerCase();
  const isCredit = hdr.includes("category");
  const txns = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const f = []; let c = "", q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { f.push(c.trim()); c = ""; } else c += ch; }
    f.push(c.trim());
    let date, desc, amount, cat;
    if (isCredit) { date=f[0]; desc=f[2]||""; cat=(f[3]||"").toLowerCase(); amount=parseFloat(f[5]); }
    else { date=f[1]; desc=f[2]||""; amount=parseFloat(f[3]); cat=""; }
    if (isNaN(amount)||!date) continue;
    const p=date.split("/");
    if (p.length===3) { const[m,d,y]=p; date=`${y.length===2?"20"+y:y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`; }
    let cid="other";
    if(cat.match(/food|dining|restaurant|grocer/)) cid="food";
    else if(cat.match(/gas|travel|auto/)) cid="transport";
    else if(cat.match(/shop|merchan/)) cid="shopping";
    else if(cat.match(/entertain|amuse/)) cid="entertainment";
    else if(cat.match(/health|medical|pharm/)) cid="health";
    else if(cat.match(/bill|utilit|phone/)) cid="utilities";
    else if(cat.match(/home|rent|mortgage/)) cid="housing";
    else if(cat.match(/personal/)) cid="personal";
    else if(cat.match(/pet/)) cid="pets";
    if (amount<0) txns.push({id:uid(),date,description:desc.slice(0,60),amount:Math.abs(amount),category:cid,type:"expense"});
  }
  return txns;
}

/* ── Editable Amount ── */
function EditableAmount({value,onChange,prefix="$",style:xs}) {
  const [ed,setEd]=useState(false);
  const [draft,setDraft]=useState("");
  const ref=useRef();
  useEffect(()=>{ if(ed){setDraft(String(value));setTimeout(()=>ref.current?.select(),30);} },[ed]);
  const commit=()=>{ const n=parseFloat(draft); if(!isNaN(n)&&n>=0) onChange(n); setEd(false); };
  if(ed) return <input ref={ref} type="number" value={draft} onChange={e=>setDraft(e.target.value)}
    onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEd(false);}}
    style={{background:"var(--s2)",border:"1px solid var(--ac)",borderRadius:7,color:"var(--tx)",fontFamily:"var(--fd)",
    padding:"3px 7px",width:110,fontSize:"inherit",fontWeight:"inherit",outline:"none",...xs}} />;
  return <span onClick={()=>setEd(true)} title="Tap to edit" style={{cursor:"pointer",borderBottom:"1px dashed var(--mu2)",paddingBottom:1,...xs}}>
    {prefix}{value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>;
}

/* ── Goal Card with animated bar ── */
function GoalCard({goal,onEdit,onDelete,onUpdateCurrent}) {
  const pct=goal.target>0?Math.min((goal.current/goal.target)*100,100):0;
  const rem=Math.max(goal.target-goal.current,0);
  const done=pct>=100;
  return (
    <div style={{background:"var(--s1)",borderRadius:14,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
        <div style={{fontSize:14,fontWeight:600,color:"var(--tx)"}}>{goal.name}</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {goal.deadline&&<span style={{fontSize:10,color:"var(--mu)"}}>by {goal.deadline}</span>}
          <button onClick={()=>onEdit(goal)} style={tiny}>edit</button>
          <button onClick={()=>onDelete(goal.id)} style={{...tiny,color:"var(--dg)"}}>×</button>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:10}}>
        <span style={{fontSize:22,fontWeight:700,fontFamily:"var(--fd)",color:"var(--ac)"}}>
          <EditableAmount value={goal.current} onChange={v=>onUpdateCurrent(goal.id,v)} />
        </span>
        <span style={{fontSize:12,color:"var(--mu)"}}>
          of <EditableAmount value={goal.target} onChange={v=>onEdit({...goal,target:v,_save:true})} style={{fontSize:12,color:"var(--mu)"}} />
        </span>
      </div>
      <div style={{background:"var(--s0)",borderRadius:8,height:12,overflow:"hidden",position:"relative"}}>
        <div style={{
          height:"100%",borderRadius:8,width:`${pct}%`,
          background:done?"linear-gradient(90deg,#4dbba8,#6bc99b)":"linear-gradient(90deg,var(--ac),var(--ac2))",
          transition:"width 1.2s cubic-bezier(0.34,1.56,0.64,1)",
          position:"relative",overflow:"hidden",
        }}>
          {!done&&pct>3&&<div style={{
            position:"absolute",inset:0,
            background:"linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.18) 50%,transparent 100%)",
            animation:"shimmer 2.8s ease-in-out infinite",
          }}/>}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:7,fontSize:10.5,color:"var(--mu)"}}>
        <span>{done?"Goal reached 🎯":`${fmt(rem)} to go`}</span>
        <span style={{fontWeight:600,color:done?"#4dbba8":"var(--ac)",fontFamily:"var(--fd)"}}>{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function StatCard({label,value,sub,accent,children}) {
  return (
    <div style={{background:"var(--s1)",borderRadius:13,padding:"16px 18px",flex:"1 1 155px",minWidth:140}}>
      <div style={{fontSize:10.5,color:"var(--mu)",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:7,fontWeight:600}}>{label}</div>
      <div style={{fontSize:24,fontWeight:700,color:accent||"var(--tx)",fontFamily:"var(--fd)",letterSpacing:"-0.02em"}}>{children||value}</div>
      {sub&&<div style={{fontSize:10.5,color:"var(--mu)",marginTop:3}}>{sub}</div>}
    </div>
  );
}

function DonutChart({data}) {
  const total=data.reduce((s,d)=>s+d.value,0);
  if(!total) return <div style={{color:"var(--mu)",textAlign:"center",padding:36,fontSize:13}}>No spending data yet</div>;
  return (
    <div style={{position:"relative",width:"100%",maxWidth:230,margin:"0 auto"}}>
      <ResponsiveContainer width="100%" height={190}>
        <PieChart><Pie data={data} cx="50%" cy="50%" innerRadius={58} outerRadius={84} paddingAngle={2} dataKey="value" stroke="none">
          {data.map((e,i)=><Cell key={i} fill={e.color}/>)}
        </Pie></PieChart>
      </ResponsiveContainer>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:700,color:"var(--tx)",fontFamily:"var(--fd)"}}>{fmt(total)}</div>
        <div style={{fontSize:9.5,color:"var(--mu)"}}>total spent</div>
      </div>
    </div>
  );
}

function CatLegend({data,onSelect,selected}) {
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  return <div style={{display:"flex",flexDirection:"column",gap:3}}>
    {data.filter(d=>d.value>0).sort((a,b)=>b.value-a.value).map(d=>(
      <div key={d.id} onClick={()=>onSelect?.(d.id===selected?null:d.id)}
        style={{display:"flex",alignItems:"center",gap:9,padding:"6px 9px",borderRadius:7,cursor:"pointer",
        background:selected===d.id?"var(--s2)":"transparent",transition:"background 0.15s"}}>
        <div style={{width:7,height:7,borderRadius:2,background:d.color,flexShrink:0}}/>
        <div style={{flex:1,fontSize:12,color:"var(--tx)"}}>{d.label}</div>
        <div style={{fontSize:12,fontWeight:600,color:"var(--tx)",fontFamily:"var(--fd)"}}>{fmt(d.value)}</div>
        <div style={{fontSize:10,color:"var(--mu)",width:30,textAlign:"right"}}>{((d.value/total)*100).toFixed(0)}%</div>
      </div>
    ))}
  </div>;
}

function TxnRow({txn,onDelete}) {
  const cat=CATEGORIES.find(c=>c.id===txn.category)||CATEGORIES.at(-1);
  return (
    <div style={{display:"flex",alignItems:"center",gap:11,padding:"10px 13px",borderRadius:9,background:"var(--s1)",marginBottom:4}}>
      <div style={{width:30,height:30,borderRadius:7,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:cat.color,flexShrink:0}}>{cat.icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12.5,fontWeight:500,color:"var(--tx)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{txn.description||cat.label}</div>
        <div style={{fontSize:10.5,color:"var(--mu)"}}>{txn.date} · {cat.label}</div>
      </div>
      <div style={{fontSize:13,fontWeight:600,color:txn.type==="income"?"#4dbba8":"var(--tx)",fontFamily:"var(--fd)",flexShrink:0}}>
        {txn.type==="income"?"+":"-"}{fmt(txn.amount)}
      </div>
      <button onClick={()=>onDelete(txn.id)} style={{...tiny,fontSize:13}}>×</button>
    </div>
  );
}

function Modal({open,onClose,title,children}) {
  if(!open) return null;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:18,backdropFilter:"blur(5px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"var(--s2)",borderRadius:16,padding:"24px 24px 20px",width:"100%",maxWidth:390,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.4)",border:"1px solid var(--bd)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"var(--tx)",fontFamily:"var(--fd)"}}>{title}</h3>
        <button onClick={onClose} style={{...tiny,fontSize:17}}>×</button>
      </div>
      {children}
    </div>
  </div>;
}

/* ── Category Budget Card ── */
function CatBudgetCard({cat, spent, budget, onSetBudget, prevSpent}) {
  const hasBudget = budget > 0;
  const pct = hasBudget ? Math.min((spent / budget) * 100, 100) : 0;
  const over = hasBudget && spent > budget;
  const diff = hasBudget ? Math.abs(spent - budget) : 0;
  const trend = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;

  const barColor = over
    ? "linear-gradient(90deg,var(--dg),#c45)"
    : pct > 80
    ? "linear-gradient(90deg,var(--wn),#e0a830)"
    : `linear-gradient(90deg,${cat.color},${cat.color}cc)`;

  return (
    <div style={{
      background:"var(--s1)",borderRadius:14,padding:"16px 18px",
      border: over ? "1px solid var(--dg)22" : "1px solid transparent",
      transition:"border-color 0.2s",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{
            width:32,height:32,borderRadius:8,
            background:cat.color+"18",display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:15,color:cat.color,flexShrink:0
          }}>{cat.icon}</div>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--tx)"}}>{cat.label}</div>
            {trend !== null && (
              <div style={{fontSize:10,color: trend > 0 ? "var(--dg)" : "var(--sc)", marginTop:1}}>
                {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}% vs last month
              </div>
            )}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:16,fontWeight:700,fontFamily:"var(--fd)",color:over?"var(--dg)":"var(--tx)"}}>{fmt(spent)}</div>
          <div style={{fontSize:10.5,color:"var(--mu)"}}>
            {hasBudget ? (
              <span>of <EditableAmount value={budget} onChange={onSetBudget} style={{fontSize:10.5,color:"var(--mu)"}}/></span>
            ) : (
              <button onClick={()=>onSetBudget(spent>0?Math.ceil(spent*1.2/50)*50:200)}
                style={{...tiny,color:"var(--ac)",fontSize:10.5,padding:0}}>+ set budget</button>
            )}
          </div>
        </div>
      </div>

      {hasBudget && (
        <>
          <div style={{background:"var(--s0)",borderRadius:6,height:7,overflow:"hidden",marginBottom:7}}>
            <div style={{
              height:"100%",borderRadius:6,width:`${pct}%`,
              background:barColor,transition:"width 0.8s ease",
            }}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5}}>
            <span style={{color:over?"var(--dg)":"var(--mu)"}}>
              {over ? `${fmt(diff)} over budget` : `${fmt(diff)} remaining`}
            </span>
            <span style={{fontWeight:600,color:over?"var(--dg)":pct>80?"var(--wn)":"var(--mu)",fontFamily:"var(--fd)"}}>
              {spent>0||hasBudget ? `${pct.toFixed(0)}%` : ""}
            </span>
          </div>
        </>
      )}
      {!hasBudget && spent > 0 && (
        <div style={{fontSize:10.5,color:"var(--mu)"}}>No budget set · click to add one</div>
      )}
    </div>
  );
}

/* ── Smart Insights ── */
function SmartInsights({mTxns, catBudgets, budget, income, txns, vMonth, vYear}) {
  const insights = useMemo(() => {
    const result = [];
    const spent = mTxns.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
    const daysInMonth = new Date(vYear,vMonth+1,0).getDate();
    const today = new Date();
    const isCurrentMonth = vMonth===today.getMonth() && vYear===today.getFullYear();
    const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
    const paceRatio = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : 0;

    // Budget pace
    if (isCurrentMonth && budget > 0) {
      const onTrackSpend = (budget / daysInMonth) * dayOfMonth;
      const diff = spent - onTrackSpend;
      if (diff > 50) {
        result.push({type:"warning",icon:"⚡",title:"Spending ahead of pace",detail:`You're ${fmt(diff)} ahead of your daily budget pace. Projected month-end: ${fmt(paceRatio)}.`});
      } else if (diff < -100) {
        result.push({type:"success",icon:"✓",title:"On track this month",detail:`You're ${fmt(Math.abs(diff))} under pace. Keep it up — projected month-end: ${fmt(paceRatio)}.`});
      }
    }

    // Category overages
    const catMap = {};
    mTxns.filter(t=>t.type==="expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
    const overBudget = CATEGORIES.filter(c=>catBudgets[c.id]>0 && (catMap[c.id]||0)>catBudgets[c.id]);
    overBudget.sort((a,b)=>((catMap[b.id]||0)-catBudgets[b.id])-((catMap[a.id]||0)-catBudgets[a.id]));
    if (overBudget.length > 0) {
      const worst = overBudget[0];
      const over = (catMap[worst.id]||0) - catBudgets[worst.id];
      result.push({type:"warning",icon:"↑",title:`${worst.label} over budget`,detail:`You've exceeded your ${worst.label} budget by ${fmt(over)} this month.`});
    }

    // Approaching budget
    const approaching = CATEGORIES.filter(c=>catBudgets[c.id]>0 && !overBudget.includes(c) && (catMap[c.id]||0)/catBudgets[c.id]>0.8);
    if (approaching.length > 0) {
      const names = approaching.map(c=>c.label).join(", ");
      result.push({type:"tip",icon:"◈",title:"Categories near limit",detail:`${names} ${approaching.length===1?"is":"are"} above 80% of budget.`});
    }

    // Biggest category
    const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
    if (sorted.length > 0) {
      const topCat = CATEGORIES.find(c=>c.id===sorted[0][0]);
      if (topCat) {
        const pct = spent > 0 ? ((sorted[0][1]/spent)*100).toFixed(0) : 0;
        result.push({type:"info",icon:"◉",title:`${topCat.label} leads spending`,detail:`${topCat.label} accounts for ${pct}% of total spending at ${fmt(sorted[0][1])}.`});
      }
    }

    // MOM comparison
    let prevMonth = vMonth-1, prevYear = vYear;
    if(prevMonth<0){prevMonth=11;prevYear--;}
    const prevTxns = txns.filter(t=>getMonth(t.date)===prevMonth&&getYear(t.date)===prevYear&&t.type==="expense");
    const prevSpent = prevTxns.reduce((s,t)=>s+t.amount,0);
    if (prevSpent > 0 && spent > 0) {
      const diff = spent - prevSpent;
      const pct = Math.abs((diff/prevSpent)*100).toFixed(0);
      if (Math.abs(diff) > 50) {
        result.push({
          type: diff > 0 ? "warning" : "success",
          icon: diff > 0 ? "▲" : "▼",
          title: `${pct}% ${diff>0?"more":"less"} than last month`,
          detail: `You spent ${fmt(Math.abs(diff))} ${diff>0?"more":"less"} than ${MONTHS[prevMonth]}.`
        });
      }
    }

    // Savings rate
    if (income > 0 && spent > 0) {
      const savedRatio = (income - spent) / income;
      if (savedRatio > 0.2) {
        result.push({type:"success",icon:"▲",title:`${(savedRatio*100).toFixed(0)}% savings rate`,detail:`Great discipline — you're saving ${fmt(income-spent)} of your ${fmt(income)} income.`});
      } else if (savedRatio < 0 ) {
        result.push({type:"warning",icon:"!",title:"Spending exceeds income",detail:`Expenses exceed income by ${fmt(Math.abs(income-spent))} this month.`});
      }
    }

    return result.slice(0, 5);
  }, [mTxns, catBudgets, budget, income, txns, vMonth, vYear]);

  if (insights.length === 0) return null;

  const colors = {warning:"var(--dg)",success:"var(--sc)",info:"var(--ac)",tip:"var(--wn)"};
  const bgs = {warning:"#d47a7a12",success:"#4dbba812",info:"#6aadcf12",tip:"#c9b45512"};

  return (
    <div style={{marginBottom:18}}>
      <h3 style={{...sec,marginBottom:10}}>Smart Insights</h3>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {insights.map((ins,i)=>(
          <div key={i} style={{display:"flex",gap:12,padding:"12px 14px",borderRadius:10,background:bgs[ins.type],border:`1px solid ${colors[ins.type]}22`}}>
            <div style={{fontSize:14,color:colors[ins.type],flexShrink:0,paddingTop:1}}>{ins.icon}</div>
            <div>
              <div style={{fontSize:12.5,fontWeight:600,color:"var(--tx)",marginBottom:2}}>{ins.title}</div>
              <div style={{fontSize:11.5,color:"var(--mu)",lineHeight:1.5}}>{ins.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── AI Insights ── */
function AIInsightsPanel({mTxns, catBudgets, budget, income, txns, vMonth, vYear}) {
  const [aiInsights, setAiInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const getAI = async () => {
    setLoading(true); setErr(null);
    try {
      const catMap = {};
      mTxns.filter(t=>t.type==="expense").forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
      const totalSpent = Object.values(catMap).reduce((s,v)=>s+v,0);

      const catSummary = CATEGORIES.filter(c=>catMap[c.id]>0).map(c=>({
        category: c.label,
        spent: catMap[c.id]?.toFixed(2),
        budget: catBudgets[c.id] || null,
        overBudget: catBudgets[c.id] ? (catMap[c.id] > catBudgets[c.id] ? `over by $${(catMap[c.id]-catBudgets[c.id]).toFixed(2)}` : `under by $${(catBudgets[c.id]-catMap[c.id]).toFixed(2)}`) : "no budget set",
      }));

      let prevMonth=vMonth-1,prevYear=vYear;
      if(prevMonth<0){prevMonth=11;prevYear--;}
      const prevSpent=txns.filter(t=>getMonth(t.date)===prevMonth&&getYear(t.date)===prevYear&&t.type==="expense").reduce((s,t)=>s+t.amount,0);

      const prompt = `You are a personal finance advisor. Analyze this spending data and give 3-4 specific, actionable insights with concrete numbers. Be direct and helpful, not generic.

Month: ${MONTHS[vMonth]} ${vYear}
Monthly budget: $${budget}
Monthly income: $${income}
Total spent: $${totalSpent.toFixed(2)}
Previous month total: $${prevSpent.toFixed(2)}

Category breakdown:
${JSON.stringify(catSummary, null, 2)}

Respond ONLY with valid JSON (no markdown, no backticks):
{"insights":[{"title":"short title","detail":"specific actionable advice with numbers","type":"warning|success|tip|info"}]}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:800,
          messages:[{role:"user",content:prompt}]
        })
      });
      const data = await res.json();
      const text = data.content?.find(b=>b.type==="text")?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setAiInsights(parsed.insights || []);
    } catch(e) {
      setErr("Couldn't load AI insights. Try again.");
    }
    setLoading(false);
  };

  const colors = {warning:"var(--dg)",success:"var(--sc)",info:"var(--ac)",tip:"var(--wn)"};
  const bgs = {warning:"#d47a7a12",success:"#4dbba812",info:"#6aadcf12",tip:"#c9b45512"};

  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:aiInsights?10:0}}>
        <h3 style={{...sec,marginBottom:0}}>AI Analysis</h3>
        <button onClick={getAI} disabled={loading} style={{
          ...chip,background:"linear-gradient(135deg,var(--ac),var(--ac2))",
          color:"#1a1f2e",fontWeight:600,fontSize:11.5,padding:"6px 14px",
          opacity:loading?0.6:1,cursor:loading?"wait":"pointer",
        }}>
          {loading?"Analyzing…":"✦ Ask AI"}
        </button>
      </div>
      {err && <div style={{fontSize:11.5,color:"var(--dg)",marginTop:6}}>{err}</div>}
      {aiInsights && (
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
          {aiInsights.map((ins,i)=>(
            <div key={i} style={{display:"flex",gap:12,padding:"12px 14px",borderRadius:10,background:bgs[ins.type]||bgs.info,border:`1px solid ${(colors[ins.type]||colors.info)}22`}}>
              <div style={{fontSize:14,color:colors[ins.type]||colors.info,flexShrink:0,paddingTop:1}}>✦</div>
              <div>
                <div style={{fontSize:12.5,fontWeight:600,color:"var(--tx)",marginBottom:2}}>{ins.title}</div>
                <div style={{fontSize:11.5,color:"var(--mu)",lineHeight:1.5}}>{ins.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!aiInsights && !loading && (
        <div style={{fontSize:11.5,color:"var(--mu)",marginTop:6}}>Get personalized spending advice powered by AI.</div>
      )}
    </div>
  );
}


// ── MAIN ──
export default function App() {
  const [txns,setTxns]=useState([]);
  const [goals,setGoals]=useState([]);
  const [budget,setBudget]=useState(4000);
  const [income,setIncome]=useState(5500);
  const [catBudgets,setCatBudgets]=useState({});
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("dashboard");
  const [showAdd,setShowAdd]=useState(false);
  const [showGoal,setShowGoal]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [editG,setEditG]=useState(null);
  const [selCat,setSelCat]=useState(null);
  const [vMonth,setVMonth]=useState(currentMonth);
  const [vYear,setVYear]=useState(currentYear);
  const fRef=useRef();

  useEffect(()=>{(async()=>{
    const[t,g,b,i,cb]=await Promise.all([load("bt",[]),load("bg",[]),load("bb",4000),load("bi",5500),load("bcb",{})]);
    setTxns(t);setGoals(g);setBudget(b);setIncome(i);setCatBudgets(cb);setLoading(false);
  })();},[]);

  const uTxns=v=>{setTxns(v);save("bt",v);};
  const uGoals=v=>{setGoals(v);save("bg",v);};
  const uBudget=v=>{setBudget(v);save("bb",v);};
  const uIncome=v=>{setIncome(v);save("bi",v);};
  const uCatBudgets=v=>{setCatBudgets(v);save("bcb",v);};
  const setCatBudget=(id,val)=>uCatBudgets({...catBudgets,[id]:val});

  const mTxns=useMemo(()=>txns.filter(t=>getMonth(t.date)===vMonth&&getYear(t.date)===vYear),[txns,vMonth,vYear]);
  const spent=useMemo(()=>mTxns.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[mTxns]);
  const rem=budget-spent;
  const pct=budget>0?Math.min((spent/budget)*100,100):0;

  const catData=useMemo(()=>{
    const m={};mTxns.filter(t=>t.type==="expense").forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
    return CATEGORIES.map(c=>({...c,value:m[c.id]||0})).filter(c=>c.value>0);
  },[mTxns]);

  // Per-category spent map
  const catSpentMap=useMemo(()=>{
    const m={};
    mTxns.filter(t=>t.type==="expense").forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
    return m;
  },[mTxns]);

  // Previous month per-category
  const prevCatSpentMap=useMemo(()=>{
    let pm=vMonth-1,py=vYear;
    if(pm<0){pm=11;py--;}
    const m={};
    txns.filter(t=>getMonth(t.date)===pm&&getYear(t.date)===py&&t.type==="expense")
      .forEach(t=>{m[t.category]=(m[t.category]||0)+t.amount;});
    return m;
  },[txns,vMonth,vYear]);

  const trendData=useMemo(()=>{
    const ms=[];
    for(let i=5;i>=0;i--){let m=currentMonth-i,y=currentYear;if(m<0){m+=12;y--;}
    const mt=txns.filter(t=>getMonth(t.date)===m&&getYear(t.date)===y);
    ms.push({month:MONTHS[m],spent:mt.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),budget});}
    return ms;
  },[txns,budget]);

  const dailyData=useMemo(()=>{
    const dim=new Date(vYear,vMonth+1,0).getDate();const ds=[];let cum=0;
    for(let d=1;d<=dim;d++){
      const s=`${vYear}-${String(vMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const ds2=mTxns.filter(t=>t.date===s&&t.type==="expense").reduce((a,t)=>a+t.amount,0);
      cum+=ds2;ds.push({day:d,spent:ds2,cumulative:cum});}
    return ds;
  },[mTxns,vMonth,vYear]);

  const addTxn=t=>{uTxns([t,...txns]);setShowAdd(false);};
  const delTxn=id=>uTxns(txns.filter(t=>t.id!==id));
  const saveGoalFn=g=>{
    if(editG) uGoals(goals.map(x=>x.id===editG.id?{...g,id:editG.id}:x));
    else uGoals([...goals,g]);
    setShowGoal(false);setEditG(null);
  };
  const delGoal=id=>uGoals(goals.filter(g=>g.id!==id));
  const updGoalCur=(id,v)=>uGoals(goals.map(g=>g.id===id?{...g,current:v}:g));
  const handleEditGoal=g=>{if(g._save){uGoals(goals.map(x=>x.id===g.id?{...x,target:g.target}:x));return;}setEditG(g);setShowGoal(true);};

  const handleCSV=e=>{
    const file=e.target.files?.[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{
      const p=parseChaseCSV(ev.target.result);
      if(!p.length){alert("No transactions found.");return;}
      const ex=new Set(txns.map(t=>`${t.date}|${t.amount}|${t.description}`));
      const nw=p.filter(t=>!ex.has(`${t.date}|${t.amount}|${t.description}`));
      uTxns([...nw,...txns].sort((a,b)=>b.date.localeCompare(a.date)));
      setShowImport(false);
      alert(`Imported ${nw.length} new transactions (${p.length-nw.length} duplicates skipped)`);
    };r.readAsText(file);e.target.value="";
  };

  const prevM=()=>{if(vMonth===0){setVMonth(11);setVYear(vYear-1);}else setVMonth(vMonth-1);};
  const nextM=()=>{if(vMonth===11){setVMonth(0);setVYear(vYear+1);}else setVMonth(vMonth+1);};

  const fTxns=selCat?mTxns.filter(t=>t.category===selCat):mTxns;

  // Breakdown summary stats
  const totalAllocated = CATEGORIES.reduce((s,c)=>s+(catBudgets[c.id]||0),0);
  const overBudgetCats = CATEGORIES.filter(c=>(catBudgets[c.id]||0)>0&&(catSpentMap[c.id]||0)>catBudgets[c.id]);

  if(loading) return <div style={{...root,display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}><span style={{color:"var(--mu)",fontSize:13}}>Loading…</span></div>;

  return (
    <div style={root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Figtree:wght@400;500;600&display=swap');
        html,body{background:#1e2230!important;margin:0;padding:0;}
        :root{--s0:#1e2230;--s1:#262b3c;--s2:#2e3448;--bd:#3a4158;--tx:#dde1ed;--tx2:#b4b9cc;--mu:#6d7590;--mu2:#4e5570;--ac:#6aadcf;--ac2:#89c4de;--dg:#d47a7a;--sc:#4dbba8;--wn:#c9b455;--fd:'Sora',sans-serif;--fb:'Figtree',sans-serif}
        *{box-sizing:border-box}
        input:focus,select:focus{border-color:var(--ac)!important}
        button{transition:transform 0.1s}
        button:active{transform:scale(0.97)}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
      `}</style>

      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <button onClick={prevM} style={navB}>‹</button>
          <span style={{fontSize:16,fontWeight:700,color:"var(--tx)",fontFamily:"var(--fd)",minWidth:105,textAlign:"center",letterSpacing:"-0.02em"}}>{MONTHS[vMonth]} {vYear}</span>
          <button onClick={nextM} style={navB}>›</button>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button onClick={()=>setShowImport(true)} style={{...chip,background:"var(--s1)"}}>⬆ Import</button>
          <button onClick={()=>setShowAdd(true)} style={{...chip,background:"var(--ac)",color:"#1a1f2e",fontWeight:600}}>+ Add</button>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={{display:"flex",gap:3,marginBottom:22,background:"var(--s1)",borderRadius:10,padding:3}}>
        {[["dashboard","Overview"],["breakdown","Breakdown"],["transactions","Transactions"],["settings","Settings"]].map(([k,l])=>(
          <button key={k} onClick={()=>setView(k)} style={{
            flex:1,padding:"8px 4px",border:"none",borderRadius:7,
            background:view===k?"var(--s2)":"transparent",
            color:view===k?"var(--tx)":"var(--mu)",
            fontWeight:view===k?600:400,fontSize:12,cursor:"pointer",fontFamily:"var(--fb)",transition:"all 0.15s",
          }}>{l}</button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {view==="dashboard"&&<>
        {/* Stats */}
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <StatCard label="Budget" accent="var(--tx)"><EditableAmount value={budget} onChange={uBudget}/></StatCard>
          <StatCard label="Spent" sub={`${pct.toFixed(0)}% of budget`} accent={pct>90?"var(--dg)":"var(--ac)"}>{fmt(spent)}</StatCard>
          <StatCard label="Remaining" sub={rem<0?"Over budget":`${(100-pct).toFixed(0)}% left`} accent={rem<0?"var(--dg)":"var(--sc)"}>{fmt(rem)}</StatCard>
        </div>

        {/* Budget progress */}
        <div style={{background:"var(--s1)",borderRadius:11,padding:"13px 16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:7,fontSize:10.5,color:"var(--mu)"}}>
            <span>Monthly progress</span><span>{fmt(spent)} / {fmt(budget)}</span>
          </div>
          <div style={{background:"var(--s0)",borderRadius:6,height:9,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:6,width:`${pct}%`,
              background:pct>90?"linear-gradient(90deg,var(--dg),#c45)":pct>70?"linear-gradient(90deg,var(--wn),var(--ac))":"linear-gradient(90deg,var(--ac),var(--ac2))",
              transition:"width 0.8s ease"}}/>
          </div>
        </div>

        {/* Goals */}
        <div style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h3 style={sec}>Goals</h3>
            <button onClick={()=>{setEditG(null);setShowGoal(true);}} style={{...chip,background:"var(--s1)",fontSize:11.5,padding:"5px 12px"}}>+ New Goal</button>
          </div>
          {goals.length===0?(
            <div style={{color:"var(--mu)",fontSize:12.5,textAlign:"center",padding:26,background:"var(--s1)",borderRadius:12}}>
              No goals yet.&nbsp;
              <button onClick={()=>{setEditG(null);setShowGoal(true);}} style={{color:"var(--ac)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:600}}>Create one</button>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:10}}>
              {goals.map(g=><GoalCard key={g.id} goal={g} onEdit={handleEditGoal} onDelete={delGoal} onUpdateCurrent={updGoalCur}/>)}
            </div>
          )}
        </div>

        {/* Charts */}
        <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) minmax(250px,1.2fr)",gap:12,marginBottom:16}}>
          <div style={{background:"var(--s1)",borderRadius:13,padding:16}}>
            <h3 style={sec}>Breakdown</h3>
            <DonutChart data={catData}/>
            <div style={{marginTop:8}}><CatLegend data={catData} onSelect={setSelCat} selected={selCat}/></div>
          </div>
          <div style={{background:"var(--s1)",borderRadius:13,padding:16}}>
            <h3 style={sec}>Spending Paces</h3>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={dailyData} margin={{top:5,right:6,left:0,bottom:0}}>
                <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6aadcf" stopOpacity={0.22}/><stop offset="100%" stopColor="#6aadcf" stopOpacity={0}/>
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a415815"/>
                <XAxis dataKey="day" tick={{fontSize:9.5,fill:"#6d7590"}} tickLine={false} axisLine={false} interval={4}/>
                <YAxis tick={{fontSize:9.5,fill:"#6d7590"}} tickLine={false} axisLine={false} tickFormatter={fmtShort} width={40}/>
                <Tooltip contentStyle={{background:"#2e3448",border:"1px solid #3a4158",borderRadius:8,fontSize:11.5,color:"#dde1ed"}} formatter={v=>[fmt(v),""]} labelFormatter={l=>`Day ${l}`}/>
                <Area type="monotone" dataKey="cumulative" stroke="#6aadcf" strokeWidth={2} fill="url(#sg)" name="Cumulative"/>
              </AreaChart>
            </ResponsiveContainer>
            <div style={{marginTop:5,display:"flex",justifyContent:"space-between",fontSize:9.5,color:"var(--mu)"}}>
              <span>Pace: {fmt(budget/new Date(vYear,vMonth+1,0).getDate())}/day</span>
              <span>Avg: {fmt(spent/Math.max(dailyData.filter(d=>d.spent>0).length,1))}/day</span>
            </div>
          </div>
        </div>

        {/* 6-month trend */}
        <div style={{background:"var(--s1)",borderRadius:13,padding:16,marginBottom:16}}>
          <h3 style={sec}>6-Month Trend</h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={trendData} margin={{top:5,right:6,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a415815"/>
              <XAxis dataKey="month" tick={{fontSize:10,fill:"#6d7590"}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fontSize:9.5,fill:"#6d7590"}} tickLine={false} axisLine={false} tickFormatter={fmtShort} width={40}/>
              <Tooltip contentStyle={{background:"#2e3448",border:"1px solid #3a4158",borderRadius:8,fontSize:11.5,color:"#dde1ed"}} formatter={v=>[fmt(v),""]}/>
              <Bar dataKey="spent" name="Spent" fill="#6aadcf" radius={[4,4,0,0]}/>
              <Bar dataKey="budget" name="Budget" fill="#3a4158" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent txns */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <h3 style={{...sec,marginBottom:0}}>{selCat?CATEGORIES.find(c=>c.id===selCat)?.label:"Recent Transactions"}</h3>
            {selCat&&<button onClick={()=>setSelCat(null)} style={{...chip,background:"var(--s1)",fontSize:10.5,padding:"3px 9px"}}>Clear</button>}
          </div>
          {fTxns.length===0?(
            <div style={{color:"var(--mu)",fontSize:12.5,textAlign:"center",padding:26,background:"var(--s1)",borderRadius:11}}>
              No transactions.&nbsp;<button onClick={()=>setShowAdd(true)} style={{color:"var(--ac)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:600}}>Add one</button>
            </div>
          ):fTxns.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8).map(t=><TxnRow key={t.id} txn={t} onDelete={delTxn}/>)}
          {fTxns.length>8&&<button onClick={()=>setView("transactions")} style={{...chip,width:"100%",background:"var(--s1)",marginTop:5,justifyContent:"center"}}>View all {fTxns.length} →</button>}
        </div>
      </>}

      {/* ═══ BREAKDOWN ═══ */}
      {view==="breakdown"&&<div>
        {/* Summary stats */}
        <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
          <StatCard label="Total Spent" sub={`${MONTHS[vMonth]} ${vYear}`} accent="var(--ac)">{fmt(spent)}</StatCard>
          <StatCard label="Cat. Budgets" sub={totalAllocated>0?`${((spent/totalAllocated)*100).toFixed(0)}% used`:"No budgets set"} accent="var(--tx)">{fmt(totalAllocated)}</StatCard>
          <StatCard label="Over Budget" sub={`${overBudgetCats.length} categor${overBudgetCats.length===1?"y":"ies"}`} accent={overBudgetCats.length>0?"var(--dg)":"var(--sc)"}>{overBudgetCats.length===0?"✓ None":overBudgetCats.length}</StatCard>
        </div>

        {/* Smart insights */}
        <SmartInsights mTxns={mTxns} catBudgets={catBudgets} budget={budget} income={income} txns={txns} vMonth={vMonth} vYear={vYear}/>

        {/* AI insights */}
        <AIInsightsPanel mTxns={mTxns} catBudgets={catBudgets} budget={budget} income={income} txns={txns} vMonth={vMonth} vYear={vYear}/>

        {/* Category budget cards */}
        <h3 style={sec}>Category Budgets</h3>
        <div style={{fontSize:11.5,color:"var(--mu)",marginBottom:12}}>
          {totalAllocated===0
            ? "Set a budget for each category to track overspending. Click \"+ set budget\" on any category."
            : `${fmt(totalAllocated)} allocated across categories · click any amount to edit`}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {CATEGORIES.filter(c=>c.id!=="savings").map(cat=>(
            <CatBudgetCard
              key={cat.id}
              cat={cat}
              spent={catSpentMap[cat.id]||0}
              budget={catBudgets[cat.id]||0}
              onSetBudget={v=>setCatBudget(cat.id,v)}
              prevSpent={prevCatSpentMap[cat.id]||0}
            />
          ))}
        </div>

        {/* Reset budgets */}
        {totalAllocated>0&&(
          <button onClick={()=>{if(confirm("Clear all category budgets?"))uCatBudgets({});}}
            style={{...chip,background:"transparent",color:"var(--mu)",border:"1px solid var(--bd)",marginTop:16,fontSize:11.5}}>
            Reset all category budgets
          </button>
        )}
      </div>}

      {/* ═══ TRANSACTIONS ═══ */}
      {view==="transactions"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
          <h3 style={{...sec,marginBottom:0}}>Transactions · {MONTHS[vMonth]}</h3>
          <span style={{fontSize:11.5,color:"var(--mu)"}}>{mTxns.length} items · {fmt(spent)}</span>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>setSelCat(null)} style={{...fChip,background:!selCat?"var(--ac)22":"var(--s1)",color:!selCat?"var(--ac)":"var(--mu)"}}>All</button>
          {CATEGORIES.filter(c=>catData.some(d=>d.id===c.id)).map(c=>(
            <button key={c.id} onClick={()=>setSelCat(selCat===c.id?null:c.id)}
              style={{...fChip,background:selCat===c.id?c.color+"20":"var(--s1)",color:selCat===c.id?c.color:"var(--mu)"}}>{c.icon} {c.label}</button>
          ))}
        </div>
        {fTxns.sort((a,b)=>b.date.localeCompare(a.date)).map(t=><TxnRow key={t.id} txn={t} onDelete={delTxn}/>)}
        {!fTxns.length&&<div style={{color:"var(--mu)",fontSize:13,textAlign:"center",padding:32}}>No transactions.</div>}
      </div>}

      {/* ═══ SETTINGS ═══ */}
      {view==="settings"&&<div style={{maxWidth:380}}>
        <h3 style={sec}>Settings</h3>
        <div style={{background:"var(--s1)",borderRadius:11,padding:16,marginBottom:12}}>
          <label style={lbl}>Monthly Budget</label>
          <input type="number" value={budget} onChange={e=>uBudget(Number(e.target.value))} style={{...inp,marginBottom:12}}/>
          <label style={lbl}>Monthly Income</label>
          <input type="number" value={income} onChange={e=>uIncome(Number(e.target.value))} style={inp}/>
        </div>
        <h3 style={sec}>Data</h3>
        <div style={{background:"var(--s1)",borderRadius:11,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,color:"var(--tx)",marginBottom:8}}>
            <span>Transactions</span><span style={{fontWeight:600,fontFamily:"var(--fd)"}}>{txns.length}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,color:"var(--tx)",marginBottom:12}}>
            <span>Goals</span><span style={{fontWeight:600,fontFamily:"var(--fd)"}}>{goals.length}</span>
          </div>
          <button onClick={()=>setShowImport(true)} style={{...chip,width:"100%",background:"var(--s0)",justifyContent:"center",marginBottom:7}}>⬆ Import Chase CSV</button>
          <button onClick={()=>{if(confirm("Clear ALL data?")){uTxns([]);uGoals([]);uCatBudgets({});}}} style={{...chip,width:"100%",background:"transparent",color:"var(--dg)",justifyContent:"center",border:"1px solid #d47a7a33"}}>Clear All Data</button>
        </div>
        <div style={{marginTop:14,padding:13,background:"var(--s1)",borderRadius:11}}>
          <h4 style={{margin:"0 0 6px",fontSize:11.5,fontWeight:600,color:"var(--tx)"}}>Importing from Chase</h4>
          <ol style={{margin:0,paddingLeft:15,fontSize:11.5,color:"var(--mu)",lineHeight:1.9}}>
            <li>Log into chase.com</li>
            <li>Account → Activity → Download</li>
            <li>Select date range, CSV format</li>
            <li>Upload the file here</li>
          </ol>
          <div style={{marginTop:8,fontSize:11,color:"var(--mu)",lineHeight:1.6}}>
            Chase credit card CSVs include a Category column — transactions will be auto-sorted into your spending categories.
          </div>
        </div>
      </div>}

      {/* Modals */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Transaction">
        <AddTxnForm onSubmit={addTxn}/>
      </Modal>
      <Modal open={showGoal} onClose={()=>{setShowGoal(false);setEditG(null);}} title={editG?"Edit Goal":"New Goal"}>
        <AddGoalForm onSubmit={saveGoalFn} initial={editG}/>
      </Modal>
      <Modal open={showImport} onClose={()=>setShowImport(false)} title="Import Chase CSV">
        <p style={{fontSize:12.5,color:"var(--mu)",margin:"0 0 12px",lineHeight:1.6}}>Upload a CSV from Chase. Auto-categorized, duplicates skipped.</p>
        <input ref={fRef} type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/>
        <button onClick={()=>fRef.current?.click()} style={pBtn}>Choose CSV File</button>
      </Modal>
    </div>
  );
}

function AddTxnForm({onSubmit}) {
  const [type,setType]=useState("expense");
  const [amt,setAmt]=useState("");
  const [cat,setCat]=useState("food");
  const [desc,setDesc]=useState("");
  const [date,setDate]=useState(todayStr());
  const go=()=>{if(!amt||isNaN(parseFloat(amt)))return;onSubmit({id:uid(),type,amount:parseFloat(amt),category:cat,description:desc,date});};
  return <div>
    <div style={{display:"flex",gap:5,marginBottom:12}}>
      {["expense","income"].map(t=>(
        <button key={t} onClick={()=>setType(t)} style={{flex:1,padding:8,borderRadius:8,border:"1px solid",
          borderColor:type===t?(t==="expense"?"var(--ac)":"var(--sc)"):"var(--bd)",
          background:type===t?(t==="expense"?"#6aadcf12":"#4dbba812"):"transparent",
          color:type===t?(t==="expense"?"var(--ac)":"var(--sc)"):"var(--mu)",
          fontWeight:600,fontSize:12.5,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{t}</button>
      ))}
    </div>
    <label style={lbl}>Amount</label>
    <input type="number" step="0.01" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0.00" style={{...inp,marginBottom:10}} autoFocus/>
    <label style={lbl}>Category</label>
    <select value={cat} onChange={e=>setCat(e.target.value)} style={{...inp,marginBottom:10,appearance:"none",cursor:"pointer"}}>
      {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
    </select>
    <label style={lbl}>Description</label>
    <input type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What was this for?" style={{...inp,marginBottom:10}}/>
    <label style={lbl}>Date</label>
    <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp,marginBottom:16}}/>
    <button onClick={go} style={pBtn}>Add Transaction</button>
  </div>;
}

function AddGoalForm({onSubmit,initial}) {
  const [name,setName]=useState(initial?.name||"");
  const [target,setTarget]=useState(initial?.target||"");
  const [current,setCurrent]=useState(initial?.current||"");
  const [deadline,setDeadline]=useState(initial?.deadline||"");
  const go=()=>{if(!name||!target)return;onSubmit({id:initial?.id||uid(),name,target:parseFloat(target),current:parseFloat(current)||0,deadline});};
  return <div>
    <label style={lbl}>Goal Name</label>
    <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g., Cabin Fund" style={{...inp,marginBottom:10}} autoFocus/>
    <label style={lbl}>Target Amount</label>
    <input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="150000" style={{...inp,marginBottom:10}}/>
    <label style={lbl}>Saved So Far</label>
    <input type="number" value={current} onChange={e=>setCurrent(e.target.value)} placeholder="0" style={{...inp,marginBottom:10}}/>
    <label style={lbl}>Target Date (optional)</label>
    <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} style={{...inp,marginBottom:16}}/>
    <button onClick={go} style={pBtn}>{initial?"Save":"Create Goal"}</button>
  </div>;
}

const root={fontFamily:"var(--fb)",background:"var(--s0)",color:"var(--tx)",minHeight:"100vh",padding:"20px 18px 36px",maxWidth:860,margin:"0 auto"};
const sec={margin:"0 0 10px",fontSize:13.5,fontWeight:600,color:"var(--tx)",fontFamily:"var(--fd)",letterSpacing:"-0.01em"};
const lbl={display:"block",fontSize:10.5,fontWeight:600,color:"var(--mu)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"};
const inp={width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--bd)",background:"var(--s0)",color:"var(--tx)",fontSize:13.5,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
const pBtn={width:"100%",padding:"10px 16px",borderRadius:10,border:"none",background:"linear-gradient(135deg,var(--ac),var(--ac2))",color:"#1a1f2e",fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
const chip={padding:"7px 13px",borderRadius:8,border:"none",fontSize:12.5,fontWeight:500,cursor:"pointer",fontFamily:"inherit",color:"var(--tx)",display:"flex",alignItems:"center",gap:5};
const fChip={padding:"4px 10px",borderRadius:6,border:"none",fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit"};
const navB={width:30,height:30,borderRadius:7,border:"none",background:"var(--s1)",color:"var(--tx)",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"};
const tiny={background:"none",border:"none",cursor:"pointer",fontSize:10.5,padding:"2px 3px",fontFamily:"inherit",color:"var(--mu)"};
