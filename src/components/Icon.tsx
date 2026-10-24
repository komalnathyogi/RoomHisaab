import type { SVGProps } from 'react'

export type IconName =
  | 'home' | 'sparkles' | 'receipt' | 'chart' | 'users' | 'bolt' | 'settings'
  | 'plus' | 'qr' | 'wallet' | 'scan' | 'clipboard' | 'bank' | 'share' | 'mic'
  | 'phone' | 'mail' | 'check' | 'copy' | 'download' | 'arrowRight' | 'arrowUpRight'
  | 'shield' | 'search' | 'sun' | 'moon' | 'system' | 'rupee' | 'cash' | 'card' | 'x' | 'help' | 'logout'

const PATHS: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 10.5 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>,
  sparkles: <><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 16l.7 1.8L7.5 18.5l-1.8.7L5 21l-.7-1.8L2.5 18.5l1.8-.7L5 16Z" /></>,
  receipt: <><path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22V2Z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17.5" cy="9" r="2.7" /><path d="M16.5 14.7c2.5.3 4.3 2 5 4.8" /></>,
  bolt: <path d="M13 2 4.5 13.5H11L9.8 22 19 10h-6.5L13 2Z" />,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M18 18h3v3h-3z" /></>,
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h13v3" /><path d="M3 7v10a2 2 0 0 0 2 2h16a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z" /><circle cx="17" cy="14" r="1" fill="currentColor" /></>,
  scan: <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M3 12h18" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 11h6M9 15h4" /></>,
  bank: <><path d="m3 9 9-6 9 6" /><path d="M4 9v10M20 9v10M2 21h20" /><path d="M8 12v5M12 12v5M16 12v5" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="5" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" /></>,
  phone: <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  download: <><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 21h16" /></>,
  arrowRight: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
  arrowUpRight: <><path d="M6 18 18 6" /><path d="M8 6h10v10" /></>,
  shield: <><path d="M12 3 5 5.8v5.4c0 4.7 3 7.9 7 9.8 4-1.9 7-5.1 7-9.8V5.8L12 3Z" /><path d="m9 12 2 2 4-4.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20.5 15.5A8.5 8.5 0 1 1 8.5 3.5a7 7 0 0 0 12 12Z" />,
  system: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  rupee: <><path d="M6 4h12M6 8.5h12" /><path d="M6 4c5.5 0 8.5 1.7 8.5 4.5S11.5 13 6 13h2.5l6.5 7" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9.5h.01M18.5 14.5h.01" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.8 2.8 0 1 1 4.1 2.3c-.8.35-1.6.9-1.6 2" /><path d="M12 17h.01" /></>,
  logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
}

export function Icon({ name, size = 20, strokeWidth = 1.9, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {PATHS[name]}
    </svg>
  )
}
