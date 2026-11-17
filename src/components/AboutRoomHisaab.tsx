import { Icon } from './Icon'

const developerPhoto = '/images/developer-komal-nath-yogi.jpg'
const developerEmail = '1komalnathyogi1@gmail.com'

export function AboutRoomHisaab({ mode = 'public' }: { mode?: 'public' | 'settings' }) {
  const compact = mode === 'settings'
  return (
    <div className={compact ? 'grid gap-4' : 'space-y-8'}>
      <section id={compact ? undefined : 'about'} tabIndex={compact ? undefined : -1} aria-labelledby="about-roomhisaab-title" className={compact ? 'card p-5 sm:p-6' : 'scroll-mt-24 rounded-3xl border border-line-light bg-surface-card p-5 shadow-card sm:p-8'}>
        <p className="kicker">About RoomHisaab</p>
        <h2 id="about-roomhisaab-title" className="mt-2 text-[25px] sm:text-[32px]">About RoomHisaab</h2>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-soft sm:text-[15px]">
          RoomHisaab helps people track personal and shared expenses in one simple place. Whether you live alone, with roommates, in a hostel, or in a shared flat, you can record costs, understand spending, and keep shared payments clear.
        </p>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-soft sm:text-[15px]">
          Our goal is to make expense tracking clear, simple, and accessible to everyone.
        </p>
        <ul className="mt-5 grid gap-2 text-[13px] sm:grid-cols-2 sm:text-[14px]">
          {['Simple expense tracking', 'Automatic expense splitting', 'UPI payment support', 'Monthly spending reports', 'One-member and shared-room support', 'Easy-to-use mobile experience'].map((item) => (
            <li key={item} className="flex items-center gap-2 rounded-xl border border-line-light bg-surface-alt px-3 py-2.5">
              <Icon name="check" size={16} className="shrink-0 text-primary" /> <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id={compact ? undefined : 'developer'} aria-labelledby="developer-title" className={compact ? 'card p-5 sm:p-6' : 'scroll-mt-24 overflow-hidden rounded-3xl border border-line-light bg-surface-card shadow-card'}>
        <div className="grid items-center gap-5 p-5 sm:p-7 md:grid-cols-[190px_1fr] md:gap-8">
          <div className="mx-auto w-full max-w-[190px]">
            <img
              src={developerPhoto}
              alt="Portrait of Komal Nath Yogi"
              width={512}
              height={512}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full rounded-2xl border-2 border-primary/25 object-contain shadow-card"
            />
          </div>
          <div className="text-center md:text-left">
            <p className="kicker">The person behind the app</p>
            <h2 id="developer-title" className="mt-2 text-[25px] sm:text-[32px]">Meet the Developer</h2>
            <p className="mt-3 font-display text-[19px] font-bold">Komal Nath Yogi</p>
            <p className="mt-1 text-[13px] font-semibold text-primary">Developer of RoomHisaab</p>
            <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-soft md:mx-0 sm:text-[15px]">
              Komal Nath Yogi is the developer of RoomHisaab, a tool created to make personal and shared expense tracking easier. The aim is to help people manage everyday expenses with a simple, clear, and user-friendly experience.
            </p>
            <a href={`mailto:${developerEmail}`} className="btn-primary mt-5 inline-flex !px-5" aria-label="Contact Komal Nath Yogi by email">
              <Icon name="mail" size={17} /> Contact Developer
            </a>
          </div>
        </div>
      </section>

      <section id={compact ? undefined : 'contact'} tabIndex={compact ? undefined : -1} aria-labelledby="contact-roomhisaab-title" className={compact ? 'card flex flex-wrap items-center gap-4 p-5 sm:p-6' : 'scroll-mt-24 flex flex-wrap items-center gap-4 rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-7'}>
        <div className="icon-tile h-12 w-12"><Icon name="mail" size={23} /></div>
        <div className="min-w-[220px] flex-1">
          <p className="kicker">Contact Us</p>
          <h2 id="contact-roomhisaab-title" className="mt-1 text-[20px] sm:text-[24px]">We welcome your feedback.</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft sm:text-[14px]">Have a question, suggestion, or feedback about RoomHisaab? Get in touch.</p>
          <a href={`mailto:${developerEmail}`} className="mt-1 inline-block break-all text-[13px] font-semibold text-primary underline underline-offset-2">{developerEmail}</a>
        </div>
        <a href={`mailto:${developerEmail}`} className="btn-outline shrink-0 !px-4"><Icon name="mail" size={17} /> Send an Email</a>
      </section>
    </div>
  )
}
