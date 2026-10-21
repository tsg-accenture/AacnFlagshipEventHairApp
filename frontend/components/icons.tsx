// Thin-line icons in the boards' style: 24px grid, round caps, 1.7 stroke. All decorative (aria-hidden);
// every icon-only control carries its own accessible name.
const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

type I = { size?: number }
const sz = (size?: number) => (size ? { width: size, height: size } : {})

export const IconToday = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z" />
  </svg>
)
export const IconMap = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <ellipse cx="12" cy="12.5" rx="7.2" ry="8.8" />
    <path d="M9.2 4.6c.4 2.6.4 13 0 15.6M14.8 4.6c-.4 2.6-.4 13 0 15.6M12 3.7v17.6" strokeWidth="1.3" />
  </svg>
)
/** Scan frame: the centre Check button */
export const IconCheck = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={1.9}>
    <path d="M4 8.5V7a3 3 0 0 1 3-3h1.5M15.5 4H17a3 3 0 0 1 3 3v1.5M20 15.5V17a3 3 0 0 1-3 3h-1.5M8.5 20H7a3 3 0 0 1-3-3v-1.5" />
    <path d="M7.5 12h9" />
  </svg>
)
export const IconAsk = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M20 11.5a7.5 7 0 0 1-10.6 6.4L4.5 19.5l1.4-3.9A7 7 0 0 1 4.5 11.5 7.75 7 0 0 1 20 11.5z" />
    <path d="M9 11.5h.01M12.25 11.5h.01M15.5 11.5h.01" strokeWidth="2.4" />
  </svg>
)
export const IconJournal = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M6 4h10.5A1.5 1.5 0 0 1 18 5.5V20H7.5A1.5 1.5 0 0 1 6 18.5z" />
    <path d="M6 18.5A1.5 1.5 0 0 1 7.5 17H18M9.5 8h5M9.5 11h3.5" />
  </svg>
)
export const IconSettings = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </svg>
)
export const IconPlan = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M9 6.5h10M9 12h10M9 17.5h10" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.6" />
  </svg>
)
export const IconGoal = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
)
export const IconSearch = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
)
export const IconArrowUpRight = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </svg>
)
export const IconChevronsRight = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={1.9}>
    <path d="m6 7 5 5-5 5M13 7l5 5-5 5" />
  </svg>
)
export const IconChevronsLeft = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={1.9}>
    <path d="m18 7-5 5 5 5M11 7l-5 5 5 5" />
  </svg>
)
export const IconBack = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={1.9}>
    <path d="m14.5 6-6 6 6 6" />
  </svg>
)
export const IconChevron = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={1.9}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
)
export const IconPlus = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={1.9}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
)
/** Magic wand with sparkles: AI-written content */
export const IconWand = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="m4.5 19.5 10-10M13 8l2.5 2.5" />
    <path d="M17.5 3.5v3M16 5h3M19.5 10.5v2M18.5 11.5h2M9.5 3.5v2M8.5 4.5h2" />
  </svg>
)
export const IconSparkle = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M10 4c.6 3.4 2.1 4.9 5.5 5.5-3.4.6-4.9 2.1-5.5 5.5-.6-3.4-2.1-4.9-5.5-5.5C7.9 8.9 9.4 7.4 10 4z" />
    <path d="M17.5 14c.3 1.7 1 2.4 2.5 2.7-1.5.3-2.2 1-2.5 2.8-.3-1.8-1-2.5-2.5-2.8 1.5-.3 2.2-1 2.5-2.7z" />
  </svg>
)
export const IconDrop = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z" />
  </svg>
)
export const IconSun = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
)
export const IconCalendar = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
    <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
    <path d="M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 16.5h.01M12 16.5h.01" strokeWidth="2.2" />
  </svg>
)
export const IconBell = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </svg>
)
export const IconClock = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)
export const IconBook = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M12 6.5C10.3 5.2 7.8 4.6 4.5 4.8v13.4c3.3-.2 5.8.4 7.5 1.7 1.7-1.3 4.2-1.9 7.5-1.7V4.8c-3.3-.2-5.8.4-7.5 1.7zM12 6.5v13.4" />
  </svg>
)
export const IconShield = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M12 3.5 19 6v5.5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
)
export const IconScissors = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="6.5" cy="7" r="2.5" />
    <circle cx="6.5" cy="17" r="2.5" />
    <path d="M8.6 8.4 19.5 17M8.6 15.6 19.5 7" />
  </svg>
)
export const IconCamera = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)
export const IconHeart = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z" />
  </svg>
)
export const IconUser = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </svg>
)
export const IconDownload = ({ size }: I) => (
  <svg {...p} {...sz(size)}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </svg>
)
export const IconMore = ({ size }: I) => (
  <svg {...p} {...sz(size)} strokeWidth={2.6}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </svg>
)

/** Crown AI mark: an original three-point crown on a black disc. */
export const CrownMark = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="16" fill="#151515" />
    <path d="M8.5 21 L7.7 11.2 L13 15.3 L16 8 L19 15.3 L24.3 11.2 L23.5 21 Z" fill="#eef27e" />
    <path d="M9 24.2h14" stroke="#eef27e" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
