// Charts — LAZY loaded (bundle budget <180KB first paint ke liye)
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatINR } from '../lib/money'

const AXIS = { fontSize: 11.5, fill: 'rgb(var(--c-ink-soft))' } as const

export function DonutChart({ data }: { data: { name: string; value: number; color: string; icon: string }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0)
  return (
    <div className="relative" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2.5}
               stroke="none" animationDuration={800} animationEasing="ease-out" isAnimationActive>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={tipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-soft font-semibold">Total</p>
          <p className="num text-[19px]">{formatINR(total)}</p>
        </div>
      </div>
    </div>
  )
}

export function WeekBars({ data }: { data: { label: string; paise: number }[] }) {
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,.18)" />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `₹${Math.round(Number(v) / 100) >= 1000 ? `${(Number(v) / 100000).toFixed(1)}k` : Math.round(Number(v) / 100)}`} />
          <Tooltip formatter={(v) => formatINR(Number(v))} labelFormatter={(l) => `Week ${l}`} contentStyle={tipStyle} cursor={{ fill: 'rgba(13,148,136,.07)' }} />
          <Bar dataKey="paise" fill="rgb(var(--c-primary))" radius={[7, 7, 3, 3]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MethodBar({ cash, upi, card }: { cash: number; upi: number; card: number }) {
  const total = cash + upi + card || 1
  const rows = [
    { k: 'UPI', v: upi, c: 'rgb(var(--c-primary))' },
    { k: 'Cash', v: cash, c: '#D99A16' },
    { k: 'Card', v: card, c: '#3E7CB1' },
  ].filter((r) => r.v > 0)
  return (
    <div className="space-y-2.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        {rows.map((r) => (
          <div key={r.k} style={{ width: `${(r.v / total) * 100}%`, background: r.c }} className="transition-all duration-700" />
        ))}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <li key={r.k} className="text-[12.5px]">
            <span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: r.c }} aria-hidden="true" />
            <span className="font-semibold">{r.k}</span>
            <span className="block num text-ink-soft">{Math.round((r.v / total) * 100)}% · {formatINR(r.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const tipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgb(var(--c-line))',
  background: 'rgb(var(--c-card))',
  color: 'rgb(var(--c-ink))',
  boxShadow: '0 10px 30px rgb(var(--c-ink) / 0.12)',
  fontSize: 13, fontWeight: 600, padding: '6px 10px',
}
