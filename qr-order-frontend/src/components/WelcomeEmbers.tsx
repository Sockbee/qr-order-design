import { useEffect, useRef } from 'react'

/** Rising fire embers, drawn locally without a remote video dependency. */
export function WelcomeEmbers({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const elapsedRef = useRef(4.2)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let width = 0
    let height = 0
    let frame = 0
    let previous = 0

    // Seeded values avoid popping or rearranging when motion is paused.
    const seed = (n: number) => {
      const value = Math.sin(n * 127.1 + 311.7) * 43758.5453
      return value - Math.floor(value)
    }
    const draw = () => {
      const t = elapsedRef.current
      context.clearRect(0, 0, width, height)
      const warmth = .38 + Math.sin(t * .35) * .02
      context.save()
      context.translate(width / 2, height)
      context.scale(1, .62)
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, width * .95)
      glow.addColorStop(0, `rgba(168, 64, 15, ${warmth})`)
      glow.addColorStop(.45, 'rgba(130, 48, 13, .14)')
      glow.addColorStop(1, 'rgba(100, 35, 10, 0)')
      context.fillStyle = glow
      context.fillRect(-width / 2, -height / .62, width, height / .62)
      context.restore()

      // Tiny ash flecks and larger glowing embers have independent speed,
      // drift and rotation, like the black-screen particle reference.
      const count = Math.max(60, Math.min(110, Math.round(width * height / 3400)))
      context.lineCap = 'round'
      for (let i = 0; i < count; i++) {
        const depth = seed(i + 1)
        const duration = 12 + seed(i + 12) * 15
        const progress = (t / duration + seed(i + 38)) % 1
        const x = width * seed(i + 82)
          + Math.sin(t * .45 + i * 2.1) * (8 + depth * 17)
          + Math.sin(progress * 5 + i) * 12
        const y = height * (1.04 - progress * 1.12)
        const fade = Math.min(1, progress * 12) * Math.min(1, (1 - progress) * 7)
        const center = Math.abs(x / width - .5) < .27 && y < height * .75 && y > height * .15
        const alpha = fade * (.18 + depth * .55) * (center ? .48 : 1)
        const angle = Math.sin(t * (.35 + depth * .6) + i * 2.4) * 1.3
        const length = 1.1 + depth * depth * 5
        const dx = Math.sin(angle) * length / 2
        const dy = Math.cos(angle) * length / 2
        const hot = depth > .87
        const rgb = hot ? '255, 198, 106' : depth > .4 ? '235, 112, 49' : '154, 92, 65'

        context.shadowBlur = hot ? 5 : 0
        context.shadowColor = `rgba(255, 125, 42, ${alpha * .5})`
        context.lineWidth = .45 + depth * .8
        context.strokeStyle = `rgba(${rgb}, ${alpha})`
        context.beginPath()
        context.moveTo(x - dx, y - dy)
        context.lineTo(x + dx, y + dy)
        context.stroke()
      }
      context.shadowBlur = 0
    }

    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const scale = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
      draw()
    }
    const tick = (now: number) => {
      if (now - previous >= 1000 / 24) {
        elapsedRef.current += previous ? Math.min((now - previous) / 1000, .1) : 0
        previous = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }
    const syncPlayback = () => {
      cancelAnimationFrame(frame)
      previous = 0
      if (!paused && !document.hidden) frame = requestAnimationFrame(tick)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    document.addEventListener('visibilitychange', syncPlayback)
    resize()
    syncPlayback()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', syncPlayback)
    }
  }, [paused])

  return <canvas ref={canvasRef} className="welcome-embers" aria-hidden="true" />
}
