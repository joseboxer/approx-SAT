import React, { useState, useRef, useEffect } from 'react'

/**
 * Ayuda contextual: icono (?) que muestra un tooltip con la descripción.
 * Mejora UX y accesibilidad (aria-describedby, focus visible).
 */
function HelpTip({ text, id }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!visible) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setVisible(false)
    }
    document.addEventListener('click', close, true)
    return () => document.removeEventListener('click', close, true)
  }, [visible])

  const tipId = id || `helptip-${Math.random().toString(36).slice(2, 9)}`
  return (
    <span className="help-tip-wrap" ref={ref}>
      <button
        type="button"
        className="help-tip-trigger"
        onClick={() => setVisible((v) => !v)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-describedby={visible ? tipId : undefined}
        aria-expanded={visible}
        title={text}
      >
        ?
      </button>
      {visible && (
        <span id={tipId} className="help-tip-popover" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}

export default HelpTip
