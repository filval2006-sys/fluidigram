import { useEffect } from 'react'
import { X } from 'lucide-react'
import { APP_COPYRIGHT, APP_CREDIT, APP_NAME, APP_VERSION } from '../appInfo'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal about" role="dialog" aria-modal aria-label={`About ${APP_NAME}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <h3>{APP_NAME}</h3>
          <button className="icon-btn" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
        </header>
        <p className="about-version">Version {APP_VERSION}</p>
        <p>Fluid system (P&amp;ID) diagrams for model rocketry. Works offline: your projects stay on your computer.</p>
        <p className="about-credit">{APP_CREDIT}</p>
        <p className="muted small">{APP_COPYRIGHT}</p>
      </div>
    </div>
  )
}
