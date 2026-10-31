import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import type { Member } from '../lib/types'
import type { NetPosition } from '../lib/balances'
import { formatINR } from '../lib/money'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import clsx from 'clsx'

interface RoomPulse3DProps {
  members: Member[]
  nets: NetPosition[]
  totalPaise: number
  reduceMotion?: boolean
}

function balanceText(netPaise: number): string {
  if (netPaise > 0) return `Gets ${formatINR(netPaise)}`
  if (netPaise < 0) return `Pays ${formatINR(Math.abs(netPaise))}`
  return 'Settled'
}

function balanceSymbol(netPaise: number): string {
  if (netPaise > 0) return '+'
  if (netPaise < 0) return '−'
  return '✓'
}

export function RoomPulse3D({ members, nets, totalPaise, reduceMotion = false }: RoomPulse3DProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const netByMember = useMemo(() => new Map(nets.map((net) => [net.memberId, net.netPaise])), [nets])
  const pictureMembers = members.slice(0, 6)
  const settledCount = members.filter((member) => (netByMember.get(member.id) ?? 0) === 0).length

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType !== 'mouse') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5
    setTilt({ x: Math.max(-4, Math.min(4, -y * 7)), y: Math.max(-5, Math.min(5, x * 8)) })
  }

  return (
    <section className={clsx('card hover-lift mb-5 overflow-hidden p-4 sm:p-6', reduceMotion && 'no-motion')} aria-labelledby="room-pulse-title">
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="icon-tile h-11 w-11"><Icon name="sparkles" size={21} /></span>
            <div className="min-w-0 flex-1">
              <p className="kicker">Picture view · optional</p>
              <h2 id="room-pulse-title" className="mt-0.5 text-[21px]">Room Pulse 3D</h2>
              <p className="text-[12px] text-ink-soft">One picture of who gets money and who pays</p>
            </div>
            <span className="badge-ok rounded-full px-2.5 py-1 text-[11px] font-bold">{settledCount}/{members.length} settled</span>
          </div>

          <div
            className="room-pulse relative mx-auto mt-1 h-[292px] w-full max-w-[520px] select-none overflow-hidden sm:h-[330px]"
            style={{ '--tilt-x': `${tilt.x}deg`, '--tilt-y': `${tilt.y}deg` } as CSSProperties}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}
            aria-hidden="true"
          >
            <div className="room-pulse__scene absolute inset-[10px]">
              <div className="room-pulse__disc absolute left-1/2 top-1/2 aspect-square w-[min(72%,330px)] -translate-x-1/2 -translate-y-1/2 rounded-full" />
              <div className="room-pulse__ring absolute left-1/2 top-1/2 aspect-square w-[min(56%,258px)] -translate-x-1/2 -translate-y-1/2 rounded-full" />
              <div className="room-pulse__ring absolute left-1/2 top-1/2 aspect-square w-[min(38%,176px)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80" />
            </div>

            <div className="room-pulse__core absolute left-1/2 top-1/2 z-10 grid h-24 w-24 place-items-center rounded-[1.65rem] bg-gradient-to-br from-[#4F46C8] via-[#5046C8] to-[#A84E0A] text-center text-white sm:h-32 sm:w-32 sm:rounded-[2rem]">
              <div className="px-2.5">
                <Icon name="rupee" size={23} className="mx-auto" />
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/80 sm:text-[9.5px]">Room spent</p>
                <p className="num font-display text-[17px] leading-tight sm:text-[19px]">{formatINR(totalPaise)}</p>
              </div>
            </div>

            {pictureMembers.map((member, index) => {
              const count = Math.max(1, pictureMembers.length)
              const angle = ((360 / count) * index - 90) * (Math.PI / 180)
              const left = 50 + Math.cos(angle) * 34
              const top = 50 + Math.sin(angle) * 33
              const net = netByMember.get(member.id) ?? 0
              return (
                <div
                  key={member.id}
                  className="room-pulse__member-wrap absolute"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <div
                    className="room-pulse__member flex w-[68px] flex-col items-center gap-1 rounded-2xl border border-line-light bg-surface-card/95 px-1.5 py-1.5 text-center min-[560px]:w-auto min-[560px]:flex-row min-[560px]:gap-2 min-[560px]:py-1.5 min-[560px]:pl-1.5 min-[560px]:pr-2.5 min-[560px]:text-left"
                    style={{ animationDelay: `${index * -0.65}s` }}
                  >
                    <Avatar name={member.name} color={member.color} size={30} />
                    <span className="min-w-0">
                      <span className="block max-w-[58px] truncate text-[10.5px] font-bold leading-tight text-ink min-[560px]:max-w-[92px] min-[560px]:text-[11px]">
                        {member.name}
                      </span>
                      <span className={clsx('block text-[12px] font-black leading-tight min-[560px]:hidden', net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-faint')}>
                        {balanceSymbol(net)}
                      </span>
                      <span className={clsx('hidden whitespace-nowrap text-[10px] font-bold leading-tight min-[560px]:block', net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-faint')}>
                        {balanceText(net)}
                      </span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-[16px]">What this picture means</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            The centre shows this period’s room spending. Names stay in the same order as the member list, so the picture does not jump around.
          </p>

          <dl className="mt-4 space-y-2.5">
            <div className="flex items-center gap-3 rounded-2xl border border-moneyin/25 bg-moneyin/10 px-3.5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-moneyin font-display text-[18px] font-black text-white dark:text-[#090B16]">+</span>
              <div>
                <dt className="font-display text-[13.5px] font-bold text-moneyin">Gets money back</dt>
                <dd className="text-[12px] leading-snug text-ink-soft">This person paid extra for the room.</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-overdue/25 bg-overdue/10 px-3.5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-overdue font-display text-[18px] font-black text-white dark:text-[#2A0D0A]">−</span>
              <div>
                <dt className="font-display text-[13.5px] font-bold text-overdue">Pays money</dt>
                <dd className="text-[12px] leading-snug text-ink-soft">This person’s share is still pending.</dd>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-line-light bg-surface-card2/70 px-3.5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft font-display text-[16px] font-black text-white dark:text-[#090B16]">✓</span>
              <div>
                <dt className="font-display text-[13.5px] font-bold">Settled</dt>
                <dd className="text-[12px] leading-snug text-ink-soft">No payment is needed from this person.</dd>
              </div>
            </div>
          </dl>

          <p className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft">
            For exact amounts, read <b className="text-ink">Member balances</b> and <b className="text-ink">Who should pay whom?</b> on this page.
          </p>
          {members.length > pictureMembers.length && (
            <p className="mt-2 text-[12px] font-semibold text-ink-faint">The picture shows the first 6 members. The full list below includes everyone.</p>
          )}
        </div>
      </div>
    </section>
  )
}
