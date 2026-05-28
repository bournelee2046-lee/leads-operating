import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const prototypePath = '/prototypes/store-portfolio-monitor-prototype.html?proto=v5'

export default function StorePortfolioMonitor() {
  const location = useLocation()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const src = useMemo(() => {
    if (location.pathname.endsWith('/config')) return `${prototypePath}&view=config`
    if (location.pathname.endsWith('/new')) return `${prototypePath}&view=new`
    if (location.pathname.endsWith('/edit')) return `${prototypePath}&view=edit`
    return prototypePath
  }, [location.pathname])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    frame.src = src
  }, [src])

  return (
    <div style={{ height: '100vh', minHeight: '100vh', width: '100%', overflow: 'hidden', background: '#f6f8fb' }}>
      <iframe
        ref={frameRef}
        title="门店组合监控"
        style={{ display: 'block', width: '100%', height: '100%', border: 0, background: '#f6f8fb' }}
      />
    </div>
  )
}
