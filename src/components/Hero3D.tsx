// ─────────────────────────────────────────────────────────────
// ⭐ INTERACTIVE 3D PRODUCT SCENE — Three.js (free, MIT)
// Abstract shapes nahi: beech me asal smartphone, uspar RoomHisaab
// app screen, chaaron taraf room, bill, QR panel, payment card,
// coins aur roommate avatars. User drag karke scene ghuma sakta hai.
// Landing par lazy-load hota hai; WebGL fail ho to CSS phone fallback.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Icon } from './Icon'

type Hotspot = 'phone' | 'qr' | 'room' | 'bill' | 'card' | 'coin'

const INFO: Record<Hotspot, { title: string; body: string }> = {
  phone: { title: 'Live app preview', body: 'Balances, splits and payments on one screen.' },
  qr: { title: 'Exact-amount QR', body: 'The QR contains the exact pending amount.' },
  room: { title: 'Room setup', body: 'Save roommates, UPI IDs and the rent cycle once.' },
  bill: { title: 'Automatic bill split', body: 'SMS and statement files can prepare the expense. You check it before saving.' },
  card: { title: 'UPI apps ready', body: 'Open GPay, PhonePe, Paytm or BHIM with the amount filled in.' },
  coin: { title: 'Accurate to the paisa', body: 'Every split is calculated exactly in paise.' },
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  roundedRectPath(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

function makeTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = typeof window !== 'undefined' && window.innerWidth < 760 ? 4 : 8
  return tex
}

function phoneScreenTexture() {
  return makeTexture(512, 1024, (ctx) => {
    ctx.fillStyle = '#F3F7F2'; ctx.fillRect(0, 0, 512, 1024)
    // Header
    const hg = ctx.createLinearGradient(0, 0, 512, 190)
    hg.addColorStop(0, '#10142B'); hg.addColorStop(1, '#2B2377')
    ctx.fillStyle = hg; ctx.fillRect(0, 0, 512, 190)
    ctx.fillStyle = '#FFFFFF'; ctx.font = '600 24px Arial'; ctx.fillText('9:41', 28, 42)
    ctx.beginPath(); ctx.arc(438, 34, 6, 0, Math.PI * 2); ctx.arc(460, 34, 6, 0, Math.PI * 2); ctx.arc(482, 34, 6, 0, Math.PI * 2); ctx.fill()
    fillRound(ctx, 28, 78, 58, 58, 18, '#4F46C8')
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.fillText('₹', 57, 120); ctx.textAlign = 'left'
    ctx.font = 'bold 31px Arial'; ctx.fillText('RoomHisaab', 102, 105)
    ctx.fillStyle = '#B9D4C7'; ctx.font = '22px Arial'; ctx.fillText('PG Room 204 · 3 members', 102, 138)

    // Balance card
    const bg = ctx.createLinearGradient(28, 220, 484, 470)
    bg.addColorStop(0, '#5046C8'); bg.addColorStop(.65, '#5F53DA'); bg.addColorStop(1, '#DE7726')
    fillRound(ctx, 28, 220, 456, 248, 30, bg)
    ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = 'bold 20px Arial'; ctx.fillText('TOTAL PENDING', 54, 267)
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 58px Arial'; ctx.fillText('₹6,812.05', 54, 330)
    ctx.font = '22px Arial'; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText('Settle the room in 2 payments', 54, 368)
    fillRound(ctx, 54, 394, 210, 48, 24, '#FFFFFF')
    ctx.fillStyle = '#3C34A3'; ctx.font = 'bold 21px Arial'; ctx.fillText('▦  Pay with QR', 74, 426)

    // Rows
    const rows = [
      ['KN', '#5046C8', 'Komal Nath', 'Rent + groceries', '+₹12,244', '#087F5B'],
      ['A', '#B45309', 'Anurag', 'WiFi + food', '-₹5,432', '#D92D20'],
      ['P', '#3C34A3', 'Prabhat', 'Electricity bill', '-₹6,812', '#D92D20'],
    ] as const
    rows.forEach((r, i) => {
      const y = 500 + i * 104
      fillRound(ctx, 28, y, 456, 86, 22, '#FFFFFF')
      ctx.strokeStyle = '#D7E6DC'; roundedRectPath(ctx, 28, y, 456, 86, 22); ctx.stroke()
      ctx.fillStyle = r[1]; ctx.beginPath(); ctx.arc(78, y + 43, 27, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#FFF'; ctx.font = 'bold 25px Arial'; ctx.textAlign = 'center'; ctx.fillText(r[0], 78, y + 52); ctx.textAlign = 'left'
      ctx.fillStyle = '#18172B'; ctx.font = 'bold 24px Arial'; ctx.fillText(r[2], 122, y + 38)
      ctx.fillStyle = '#514E6B'; ctx.font = '19px Arial'; ctx.fillText(r[3], 122, y + 67)
      ctx.fillStyle = r[5]; ctx.font = 'bold 23px Arial'; ctx.textAlign = 'right'; ctx.fillText(r[4], 458, y + 52); ctx.textAlign = 'left'
    })

    // Mini chart
    fillRound(ctx, 28, 824, 456, 104, 22, '#ECEBFA')
    const bars = [34, 58, 44, 72, 52, 82, 64]
    bars.forEach((b, i) => { fillRound(ctx, 58 + i * 58, 904 - b, 30, b, 8, i === 5 ? '#DE7726' : '#4F46C8') })

    // Bottom nav
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 946, 512, 78)
    ctx.fillStyle = '#DADAF0'; ctx.fillRect(0, 946, 512, 2)
    ;[62, 158, 350, 448].forEach((x) => { ctx.fillStyle = '#88AB9C'; ctx.beginPath(); ctx.arc(x, 982, 13, 0, Math.PI * 2); ctx.fill() })
    fillRound(ctx, 226, 954, 60, 60, 18, '#5046C8')
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.fillText('▦', 256, 995); ctx.textAlign = 'left'
  })
}

function qrTexture() {
  return makeTexture(384, 384, (ctx) => {
    ctx.fillStyle = '#FFF'; ctx.fillRect(0, 0, 384, 384)
    const cell = 16
    let seed = 42
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    ctx.fillStyle = '#18172B'
    for (let y = 1; y < 23; y++) for (let x = 1; x < 23; x++) if (rnd() > .53) ctx.fillRect(x * cell, y * cell, cell - 2, cell - 2)
    const finder = (x: number, y: number) => {
      ctx.fillStyle = '#FFF'; ctx.fillRect(x - 8, y - 8, 128, 128)
      ctx.fillStyle = '#18172B'; ctx.fillRect(x, y, 112, 112)
      ctx.fillStyle = '#FFF'; ctx.fillRect(x + 16, y + 16, 80, 80)
      ctx.fillStyle = '#18172B'; ctx.fillRect(x + 32, y + 32, 48, 48)
    }
    finder(24, 24); finder(248, 24); finder(24, 248)
    fillRound(ctx, 151, 151, 82, 82, 18, '#5046C8')
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 43px Arial'; ctx.textAlign = 'center'; ctx.fillText('₹', 192, 207); ctx.textAlign = 'left'
  })
}

function receiptTexture() {
  return makeTexture(384, 540, (ctx) => {
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 384, 540)
    ctx.fillStyle = '#18172B'; ctx.font = 'bold 25px Arial'; ctx.fillText('ELECTRICITY BILL', 28, 52)
    ctx.fillStyle = '#514E6B'; ctx.font = '18px Arial'; ctx.fillText('Auto Capture · SMS', 28, 82)
    ctx.strokeStyle = '#DADAF0'; ctx.beginPath(); ctx.moveTo(28, 108); ctx.lineTo(356, 108); ctx.stroke()
    ctx.fillStyle = '#5046C8'; ctx.font = 'bold 46px Arial'; ctx.fillText('₹1,240', 28, 174)
    ctx.fillStyle = '#18172B'; ctx.font = '19px Arial'
    ;[['Merchant', 'MSEB'], ['Paid by', 'Komal Nath'], ['Split', '3 members'], ['Per person', '₹413.34']].forEach((r, i) => {
      const y = 232 + i * 48
      ctx.fillStyle = '#514E6B'; ctx.fillText(r[0], 28, y)
      ctx.fillStyle = '#18172B'; ctx.font = 'bold 19px Arial'; ctx.textAlign = 'right'; ctx.fillText(r[1], 356, y); ctx.textAlign = 'left'; ctx.font = '19px Arial'
    })
    fillRound(ctx, 28, 432, 154, 42, 21, '#E8FFF5')
    ctx.fillStyle = '#087F5B'; ctx.font = 'bold 18px Arial'; ctx.fillText('AUTO SPLIT ✓', 45, 460)
    ctx.fillStyle = '#18172B'
    let x = 28; while (x < 340) { const w = 3 + ((x * 17) % 9); ctx.fillRect(x, 492, w, 30); x += w + 5 }
  })
}

function cardTexture() {
  return makeTexture(512, 320, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 512, 320)
    g.addColorStop(0, '#5046C8'); g.addColorStop(.55, '#5046C8'); g.addColorStop(1, '#DE7726')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 320)
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(455, 32, 120, 0, Math.PI * 2); ctx.arc(486, 58, 82, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 28px Arial'; ctx.fillText('RoomHisaab PAY', 34, 56)
    ctx.font = '18px Arial'; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText('UPI AUTO-FILL', 34, 86)
    fillRound(ctx, 34, 124, 64, 46, 9, '#F8C85B')
    ctx.strokeStyle = '#9A6B12'; ctx.strokeRect(43, 134, 46, 26)
    ctx.fillStyle = '#FFF'; ctx.font = '24px monospace'; ctx.fillText('k.@okhdfc', 34, 232)
    ctx.font = 'bold 31px Arial'; ctx.textAlign = 'right'; ctx.fillText('₹6,812', 478, 278); ctx.textAlign = 'left'
  })
}

function coinTexture() {
  return makeTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(92, 78, 10, 128, 128, 130)
    g.addColorStop(0, '#FFE9A8'); g.addColorStop(.55, '#F6C453'); g.addColorStop(1, '#C98A12')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = '#9A6B12'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(128, 128, 105, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(128, 128, 91, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#7A5200'; ctx.font = 'bold 118px Arial'; ctx.textAlign = 'center'; ctx.fillText('₹', 128, 169); ctx.textAlign = 'left'
  })
}

function labelSprite(text: string, sub: string, color: string) {
  const tex = makeTexture(512, 150, (ctx) => {
    ctx.shadowColor = 'rgba(10,10,35,.25)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8
    fillRound(ctx, 12, 12, 488, 126, 30, 'rgba(255,255,255,.96)')
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(62, 75, 27, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 29px Arial'; ctx.textAlign = 'center'; ctx.fillText('✓', 62, 86); ctx.textAlign = 'left'
    ctx.fillStyle = '#18172B'; ctx.font = 'bold 31px Arial'; ctx.fillText(text, 108, 68)
    ctx.fillStyle = '#514E6B'; ctx.font = '22px Arial'; ctx.fillText(sub, 108, 104)
  })
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sp.scale.set(1.85, .54, 1)
  return sp
}

function avatarSprite(initial: string, color: string) {
  const tex = makeTexture(192, 192, (ctx) => {
    ctx.shadowColor = 'rgba(10,10,35,.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(96, 96, 76, 0, Math.PI * 2); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 7; ctx.stroke()
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 76px Arial'; ctx.textAlign = 'center'; ctx.fillText(initial, 96, 123); ctx.textAlign = 'left'
  })
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sp.scale.set(.68, .68, 1)
  return sp
}

function roundedBoxGeometry(w: number, h: number, d: number, r: number) {
  const x = -w / 2, y = -h / 2
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSegments: 3, bevelSize: Math.min(.035, r / 2), bevelThickness: .025, curveSegments: 10 })
  geo.center()
  return geo
}

function isLowPowerDevice(): boolean {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }
  const cores = nav.hardwareConcurrency ?? 8
  const memory = nav.deviceMemory ?? 8
  const saveData = nav.connection?.saveData === true
  const slowConnection = /(^|-)2g$/.test(nav.connection?.effectiveType ?? '')
  return window.innerWidth < 760 || cores <= 4 || memory <= 4 || saveData || slowConnection
}

function markHotspot(obj: THREE.Object3D, key: Hotspot) {
  obj.traverse((child) => { child.userData.hotspot = key })
}

export default function Hero3D({ className = '' }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<{ reset: () => void } | null>(null)
  const autoRef = useRef(true)
  const [failed, setFailed] = useState(false)
  const [auto, setAuto] = useState(true)
  const [selected, setSelected] = useState<Hotspot>('phone')

  useEffect(() => { autoRef.current = auto }, [auto])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setAuto(false); autoRef.current = false }
    const lowPower = isLowPowerDevice()
    const darkNow = () => document.documentElement.classList.contains('dark')

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !lowPower,
        alpha: true,
        powerPreference: lowPower ? 'low-power' : 'high-performance',
      })
    } catch (err) {
      console.warn('[RoomHisaab] 3D unavailable; using the CSS phone fallback', err)
      setFailed(true)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.8))
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = !lowPower
    renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: window.matchMedia('(pointer: coarse)').matches ? 'pan-y' : 'none' })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100)
    camera.position.set(0, .65, 10.6)
    camera.lookAt(0, -.05, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x282552, 1.9))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(4.5, 7, 6)
    key.castShadow = !lowPower
    key.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024)
    key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6
    key.shadow.radius = lowPower ? 2 : 5
    scene.add(key)
    const indigoGlow = new THREE.PointLight(0x5046c8, 32, 18); indigoGlow.position.set(-4.5, 1.5, 4.5); scene.add(indigoGlow)
    const marigoldGlow = new THREE.PointLight(0xde7726, 20, 16); marigoldGlow.position.set(4.8, -1, 3.5); scene.add(marigoldGlow)

    const turntable = new THREE.Group()
    scene.add(turntable)
    const world = new THREE.Group()
    turntable.add(world)

    const palette = () => darkNow()
      ? { platform: 0x141627, platformTop: 0x1d2038, edge: 0x7066f2, point: 0xa8a0ff }
      : { platform: 0x2b2760, platformTop: 0x3c34a3, edge: 0x5046c8, point: 0xa8a0ff }
    let pal = palette()

    const matPhone = new THREE.MeshStandardMaterial({ color: 0x15172f, metalness: .55, roughness: .28 })
    const matPhoneSide = new THREE.MeshStandardMaterial({ color: 0x5f53da, metalness: .6, roughness: .25 })
    const matWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .05, roughness: .32 })
    const matIndigo = new THREE.MeshStandardMaterial({ color: 0x5046c8, metalness: .3, roughness: .28 })
    const matMarigold = new THREE.MeshStandardMaterial({ color: 0xde7726, metalness: .24, roughness: .3 })
    const matCream = new THREE.MeshStandardMaterial({ color: 0xfff1d6, metalness: .04, roughness: .45 })
    const matGoldSide = new THREE.MeshStandardMaterial({ color: 0xd99c1f, metalness: .78, roughness: .2 })
    const matPlatform = new THREE.MeshStandardMaterial({ color: pal.platform, metalness: .42, roughness: .3 })
    const matPlatformTop = new THREE.MeshStandardMaterial({ color: pal.platformTop, metalness: .3, roughness: .34 })
    const matEdge = new THREE.MeshStandardMaterial({ color: pal.edge, emissive: pal.edge, emissiveIntensity: .48, metalness: .2, roughness: .25 })

    // ── Stage / turntable ───────────────────────────────
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.15, 4.35, .28, 72), matPlatform)
    base.position.y = -2.72; base.receiveShadow = true; world.add(base)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.72, 3.82, .14, 72), matPlatformTop)
    top.position.y = -2.52; top.receiveShadow = true; world.add(top)
    const edge = new THREE.Mesh(new THREE.TorusGeometry(4.14, .035, 10, 120), matEdge)
    edge.rotation.x = Math.PI / 2; edge.position.y = -2.61; world.add(edge)
    ;[1.8, 2.65, 3.3].forEach((r) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .012, 8, 110), new THREE.MeshBasicMaterial({ color: pal.edge, transparent: true, opacity: .32 }))
      ring.rotation.x = Math.PI / 2; ring.position.y = -2.44; world.add(ring)
    })

    // Big backdrop orbit ring
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3.55, .035, 12, 140), matEdge)
    halo.position.set(0, .15, -1.45); halo.rotation.set(.12, -.08, -.12); world.add(halo)
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(3.85, .014, 8, 140), new THREE.MeshBasicMaterial({ color: 0xde7726, transparent: true, opacity: .58 }))
    halo2.position.copy(halo.position); halo2.rotation.set(.35, .18, .28); world.add(halo2)

    // ── Smartphone with real app screen ────────────────
    const phone = new THREE.Group()
    phone.position.set(0, .12, .42)
    phone.rotation.set(.035, -.18, -.015)
    const phoneBody = new THREE.Mesh(roundedBoxGeometry(2.24, 4.58, .17, .28), matPhone)
    phoneBody.castShadow = true; phone.add(phoneBody)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 4.28), new THREE.MeshBasicMaterial({ map: phoneScreenTexture(), toneMapped: false }))
    screen.position.z = .128; phone.add(screen)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 4.28), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .08, roughness: .05, metalness: 0 }))
    glass.position.z = .136; phone.add(glass)
    const cameraDot = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .018, 20), new THREE.MeshBasicMaterial({ color: 0x050510 }))
    cameraDot.rotation.x = Math.PI / 2; cameraDot.position.set(0, 2.08, .145); phone.add(cameraDot)
    const buttonGeo = new THREE.BoxGeometry(.045, .48, .07)
    ;[-1.14, 1.14].forEach((x, i) => {
      const b = new THREE.Mesh(buttonGeo, matPhoneSide)
      b.position.set(x, i ? .68 : .92, 0); phone.add(b)
    })
    world.add(phone); markHotspot(phone, 'phone')

    // ── Mini room / house ───────────────────────────────
    const room = new THREE.Group()
    room.position.set(-2.58, -1.62, -.82); room.rotation.y = .34
    const houseBase = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 1.1), matCream)
    houseBase.castShadow = true; room.add(houseBase)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.13, .72, 4), matMarigold)
    roof.position.y = .88; roof.rotation.y = Math.PI / 4; roof.scale.z = .78; roof.castShadow = true; room.add(roof)
    const door = new THREE.Mesh(new THREE.BoxGeometry(.34, .62, .04), matIndigo)
    door.position.set(-.22, -.2, .58); room.add(door)
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffc65c, emissive: 0xffa726, emissiveIntensity: .9 })
    ;[.34, .02].forEach((x, i) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(.28, .28, .04), winMat)
      w.position.set(x + (i ? .08 : 0), i ? -.22 : .16, .58); room.add(w)
    })
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(.22, .48, .22), matWhite)
    chimney.position.set(.42, 1.03, -.12); room.add(chimney)
    world.add(room); markHotspot(room, 'room')

    // ── Floating receipt / bill ─────────────────────────
    const bill = new THREE.Group()
    bill.position.set(-2.28, 1.05, -.25); bill.rotation.set(-.05, .36, -.1)
    const billGeo = new THREE.PlaneGeometry(1.22, 1.72, 10, 12)
    const posAttr = billGeo.getAttribute('position')
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), y = posAttr.getY(i)
      posAttr.setZ(i, Math.sin(x * 4.2) * .025 + Math.cos(y * 3) * .018)
    }
    billGeo.computeVertexNormals()
    const billMesh = new THREE.Mesh(billGeo, new THREE.MeshStandardMaterial({ map: receiptTexture(), side: THREE.DoubleSide, roughness: .55 }))
    billMesh.castShadow = true; bill.add(billMesh)
    world.add(bill); markHotspot(bill, 'bill')

    // ── QR payment panel ────────────────────────────────
    const qrPanel = new THREE.Group()
    qrPanel.position.set(2.38, .88, .02); qrPanel.rotation.set(.03, -.34, .06)
    const qrBack = new THREE.Mesh(roundedBoxGeometry(1.38, 1.64, .09, .18), matWhite)
    qrBack.castShadow = true; qrPanel.add(qrBack)
    const qrPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.08), new THREE.MeshBasicMaterial({ map: qrTexture(), toneMapped: false }))
    qrPlane.position.set(0, .13, .072); qrPanel.add(qrPlane)
    const qrBar = new THREE.Mesh(new THREE.BoxGeometry(.82, .16, .025), matIndigo)
    qrBar.position.set(0, -.6, .078); qrPanel.add(qrBar)
    world.add(qrPanel); markHotspot(qrPanel, 'qr')

    // ── UPI payment card ────────────────────────────────
    const payCard = new THREE.Group()
    payCard.position.set(2.18, -1.28, .93); payCard.rotation.set(-.06, -.42, -.08)
    const cardBody = new THREE.Mesh(roundedBoxGeometry(1.9, 1.16, .075, .16), matIndigo)
    cardBody.castShadow = true; payCard.add(cardBody)
    const cardFace = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 1.04), new THREE.MeshBasicMaterial({ map: cardTexture(), toneMapped: false }))
    cardFace.position.z = .074; payCard.add(cardFace)
    world.add(payCard); markHotspot(payCard, 'card')

    // ── Gold ₹ coins ────────────────────────────────────
    const coinFaceMat = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: .55, roughness: .24 })
    const coins: THREE.Group[] = []
    const coinData: [number, number, number, number][] = [
      [-1.72, -.5, 1.18, .48], [1.58, 1.98, -.62, .4], [-2.9, .25, .72, .34], [2.92, -.28, -.86, .36],
    ]
    coinData.forEach(([x, y, z, r], i) => {
      const g = new THREE.Group(); g.position.set(x, y, z)
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .09, 42), [matGoldSide, coinFaceMat, coinFaceMat])
      coin.rotation.x = Math.PI / 2; coin.castShadow = true; g.add(coin)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r + .012, .018, 8, 48), matGoldSide)
      g.add(rim); g.rotation.y = i * .45
      coins.push(g); world.add(g); markHotspot(g, 'coin')
    })

    // ── Roommate avatars + feature labels ───────────────
    const avatarData = [
      { sp: avatarSprite('K', '#5046C8'), r: 3.05, phase: .4, y: 1.55, speed: .16 },
      { sp: avatarSprite('A', '#B45309'), r: 3.2, phase: 2.5, y: .1, speed: .13 },
      { sp: avatarSprite('R', '#3C34A3'), r: 3.05, phase: 4.35, y: -1.15, speed: .18 },
    ]
    avatarData.forEach((a) => world.add(a.sp))

    const labels = [
      { sp: labelSprite('Auto Split', 'Expense ready from SMS', '#5046C8'), pos: new THREE.Vector3(-2.12, 2.02, .25), phase: 0 },
      { sp: labelSprite('QR Pay', 'Exact ₹6,812.05', '#B45309'), pos: new THREE.Vector3(2.2, 1.95, .3), phase: 1.4 },
      { sp: labelSprite('Settled', '2 payments · zero confusion', '#087F5B'), pos: new THREE.Vector3(-2.25, -1.82, .65), phase: 2.7 },
    ]
    labels.forEach((l) => { l.sp.position.copy(l.pos); world.add(l.sp) })

    // Curved money-flow tubes
    const makeTube = (points: THREE.Vector3[], color: number) => {
      const curve = new THREE.CatmullRomCurve3(points)
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 42, .018, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .62 }))
      world.add(mesh); return mesh
    }
    makeTube([new THREE.Vector3(-2.3, .55, -.2), new THREE.Vector3(-1.3, 1.05, .7), new THREE.Vector3(-.55, .8, .75)], 0x35a99c)
    makeTube([new THREE.Vector3(.65, .95, .7), new THREE.Vector3(1.45, 1.45, .55), new THREE.Vector3(2.05, 1.05, .28)], 0xde7726)
    makeTube([new THREE.Vector3(.65, -.85, .72), new THREE.Vector3(1.4, -1.2, 1.05), new THREE.Vector3(1.85, -1.28, .95)], 0x34d399)

    // Depth particles
    const N = lowPower ? 80 : 230
    const p = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 2.7 + Math.random() * 3.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1)
      p[i * 3] = r * Math.sin(ph) * Math.cos(th)
      p[i * 3 + 1] = r * Math.cos(ph) * .62
      p[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - .6
    }
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    const pMat = new THREE.PointsMaterial({ color: pal.point, size: .045, transparent: true, opacity: .72, depthWrite: false })
    const points = new THREE.Points(pGeo, pMat); world.add(points)

    const hotspotGroups: Record<Hotspot, THREE.Group[]> = { phone: [phone], qr: [qrPanel], room: [room], bill: [bill], card: [payCard], coin: coins }
    const baseScales = new Map<THREE.Object3D, number>()
    Object.values(hotspotGroups).flat().forEach((g) => baseScales.set(g, g.scale.x))
    let selectedKey: Hotspot = 'phone'
    let pulseAt = -10

    const mo = new MutationObserver(() => {
      pal = palette()
      matPlatform.color.setHex(pal.platform); matPlatformTop.color.setHex(pal.platformTop)
      matEdge.color.setHex(pal.edge); matEdge.emissive.setHex(pal.edge); pMat.color.setHex(pal.point)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const resize = () => {
      const w = mount.clientWidth || 620, h = mount.clientHeight || 560
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.position.z = camera.aspect < .72 ? 13.2 : camera.aspect < 1 ? 11.8 : 10.5
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(mount)

    // Drag rotate + hover depth + click hotspots
    let dragYaw = -.08, dragPitch = .02, yaw = dragYaw, pitch = dragPitch
    let hoverX = 0, hoverY = 0, dragging = false, moved = 0, lastX = 0, lastY = 0
    controlsRef.current = { reset: () => { dragYaw = -.08; dragPitch = .02; setSelected('phone'); selectedKey = 'phone'; pulseAt = clock.getElapsedTime() } }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(Object.values(hotspotGroups).flat(), true)
      const keyHit = hits.find((h) => h.object.userData.hotspot)?.object.userData.hotspot as Hotspot | undefined
      if (keyHit) { selectedKey = keyHit; setSelected(keyHit); pulseAt = clock.getElapsedTime() }
    }

    const onDown = (e: PointerEvent) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture?.(e.pointerId) }
    const onMove = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect()
      if (!dragging) {
        hoverX = ((e.clientX - r.left) / Math.max(r.width, 1) - .5) * 2
        hoverY = ((e.clientY - r.top) / Math.max(r.height, 1) - .5) * 2
        return
      }
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      moved += Math.abs(dx) + Math.abs(dy); lastX = e.clientX; lastY = e.clientY
      dragYaw = THREE.MathUtils.clamp(dragYaw + dx * .0075, -1.15, 1.15)
      dragPitch = THREE.MathUtils.clamp(dragPitch + dy * .0045, -.34, .42)
      if (reduced) renderFrame(clock.getElapsedTime())
    }
    const onUp = (e: PointerEvent) => { if (dragging && moved < 7) pick(e); dragging = false }
    const onLeave = () => { hoverX = 0; hoverY = 0; dragging = false }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointercancel', onLeave)

    let visible = true
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true }, { threshold: .04 })
    io.observe(mount)

    const clock = new THREE.Clock()
    function renderFrame(t: number) {
      const autoYaw = autoRef.current && !dragging ? Math.sin(t * .42) * .3 : 0
      yaw += (dragYaw + autoYaw + hoverX * .07 - yaw) * .055
      pitch += (dragPitch + hoverY * .045 - pitch) * .055
      turntable.rotation.y = yaw
      turntable.rotation.x = pitch
      turntable.position.y = Math.sin(t * .72) * .055

      phone.position.y = .12 + Math.sin(t * .9) * .055
      phone.rotation.y = -.18 + Math.sin(t * .55) * .045
      bill.position.y = 1.05 + Math.sin(t * 1.05 + 1) * .09
      bill.rotation.z = -.1 + Math.sin(t * .7) * .035
      qrPanel.position.y = .88 + Math.sin(t * .95 + 2) * .08
      qrPanel.rotation.y = -.34 + Math.sin(t * .62) * .07
      payCard.position.y = -1.28 + Math.sin(t * .82 + 3) * .07
      payCard.rotation.y = -.42 + Math.sin(t * .5) * .06
      room.position.y = -1.62 + Math.sin(t * .68 + .5) * .035
      halo.rotation.z = -.12 + t * .025
      halo2.rotation.z = .28 - t * .018
      points.rotation.y = t * .022

      coins.forEach((c, i) => {
        c.rotation.y = t * (.55 + i * .07) + i
        c.position.y = coinData[i][1] + Math.sin(t * 1.15 + i * 1.3) * .08
      })
      avatarData.forEach((a) => {
        const ang = a.phase + t * a.speed
        a.sp.position.set(Math.cos(ang) * a.r, a.y + Math.sin(t * 1.1 + a.phase) * .07, Math.sin(ang) * a.r * .42 - .25)
      })
      labels.forEach((l) => { l.sp.position.y = l.pos.y + Math.sin(t * .9 + l.phase) * .06 })

      Object.entries(hotspotGroups).forEach(([keyName, groups]) => {
        groups.forEach((g) => {
          const baseScale = baseScales.get(g) ?? 1
          const active = keyName === selectedKey
          const since = t - pulseAt
          const pulse = active && since >= 0 && since < .9 ? Math.sin((since / .9) * Math.PI) * .09 : 0
          const target = baseScale * (1 + (active ? .025 : 0) + pulse)
          g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target, .18))
        })
      })

      renderer.render(scene, camera)
    }

    let raf = 0
    if (reduced) {
      renderFrame(1.4)
    } else {
      // Phones do not need a full 60 fps decorative scene. Thirty frames
      // per second still looks smooth and uses much less battery/GPU.
      const frameInterval = lowPower ? 1000 / 30 : 0
      let lastRender = 0
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop)
        if (!visible || document.hidden) return
        if (frameInterval && now - lastRender < frameInterval) return
        lastRender = now
        renderFrame(clock.getElapsedTime())
      }
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      controlsRef.current = null
      mo.disconnect(); ro.disconnect(); io.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('pointercancel', onLeave)
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        const disposeMat = (m: THREE.Material) => {
          Object.values(m as unknown as Record<string, unknown>).forEach((v) => { if (v instanceof THREE.Texture) v.dispose() })
          m.dispose()
        }
        if (Array.isArray(mat)) mat.forEach(disposeMat); else if (mat) disposeMat(mat)
        const sprite = obj as THREE.Sprite
        if (sprite.isSprite) { sprite.material.map?.dispose(); sprite.material.dispose() }
      })
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  if (failed) {
    return (
      <div className={`relative grid place-items-center overflow-hidden ${className}`} role="img" aria-label="Preview of the RoomHisaab mobile app and QR payment">
        <div className="absolute h-72 w-72 rounded-full border-2 border-primary/25 animate-spinSlow" />
        <div className="absolute h-[430px] w-[430px] rounded-full border border-accent/20" />
        <div className="relative w-[230px] rounded-[34px] bg-[#15172F] p-2.5 shadow-lift3d rotate-[-4deg]">
          <div className="rounded-[27px] bg-surface-card p-4 min-h-[430px]">
            <p className="font-display font-bold">RoomHisaab</p>
            <div className="mt-4 rounded-2xl bg-primary-solid text-primary-on p-4"><p className="text-[11px] opacity-80">TOTAL PENDING</p><p className="num text-[26px]">₹6,812.05</p></div>
            <div className="mx-auto mt-5 grid h-32 w-32 place-items-center rounded-2xl bg-white shadow-card" style={{ backgroundImage: 'linear-gradient(90deg,#18172B 12%,transparent 12%,transparent 25%,#18172B 25%,#18172B 38%,transparent 38%),linear-gradient(#18172B 12%,transparent 12%,transparent 25%,#18172B 25%,#18172B 38%,transparent 38%)', backgroundSize: '34px 34px' }}>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-solid text-primary-on font-display font-bold">₹</span>
            </div>
            <p className="mt-4 text-center text-[13px] font-semibold">Exact payment with QR</p>
          </div>
        </div>
      </div>
    )
  }

  const info = INFO[selected]
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" role="img"
        aria-label="Interactive 3D scene with a RoomHisaab smartphone, room, bill, QR payment panel, UPI card and coins. Drag to rotate." />

      <div className="pointer-events-none absolute left-3 top-3 max-w-[232px] rounded-2xl glass px-3.5 py-2.5 shadow-card sm:left-5 sm:top-5 sm:max-w-[290px] sm:px-4 sm:py-3" aria-live="polite">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary"><span className="h-2 w-2 rounded-full bg-moneyin animate-pulse" /> Interactive 3D</p>
        <p className="font-display font-bold text-[16px] mt-1">{info.title}</p>
        <p className="text-[12.5px] leading-snug text-ink-soft mt-.5">{info.body}</p>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 sm:bottom-5 flex items-center gap-2 rounded-full glass p-1.5 shadow-card">
        <span className="hidden whitespace-nowrap sm:flex items-center gap-1.5 px-2 text-[12px] font-semibold text-ink-soft"><Icon name="scan" size={16} /> Drag · tap an item</span>
        <button type="button" onClick={() => setAuto((v) => !v)} className={`${auto ? 'chip-on' : 'chip-off'} !min-h-[42px] !px-3 whitespace-nowrap`} aria-pressed={auto}>
          {auto ? 'Auto 3D On' : 'Auto 3D Off'}
        </button>
        <button type="button" onClick={() => controlsRef.current?.reset()} className="chip-off !min-h-[42px] !px-3 whitespace-nowrap">Reset view</button>
      </div>
    </div>
  )
}
