import './ScanAnimation.css'

export default function ScanAnimation({ subnet }) {
  return (
    <div className="scan-anim-wrap">
      <div className="radar-container">
        <div className="radar-ring ring-1" />
        <div className="radar-ring ring-2" />
        <div className="radar-ring ring-3" />
        <div className="radar-sweep" />
        <div className="radar-center">
          <div className="radar-dot" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="radar-blip" style={{
            '--angle': `${i * 60 + 30}deg`,
            '--delay': `${i * 0.3}s`,
            '--dist': `${30 + (i % 3) * 20}%`
          }} />
        ))}
      </div>
      <div className="scan-text">
        <div className="scan-title">Scanning Network</div>
        <div className="scan-subtitle">{subnet ? `${subnet}.1 — ${subnet}.254` : 'Detecting subnet...'}</div>
        <div className="scan-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}
