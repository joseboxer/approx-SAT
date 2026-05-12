import { useEffect, useLayoutEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function listFocusable(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (!(el instanceof HTMLElement)) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    return el.closest('[aria-hidden="true"]') == null
  })
}

/**
 * Enfoque inicial, Escape, trampa de foco (Tab) y restauración del foco al cerrar.
 * @param {boolean} open
 * @param {React.RefObject<HTMLElement|null>} panelRef Contenedor del diálogo (p. ej. inner .modal)
 * @param {{ onClose?: () => void, trapFocus?: boolean }} [options] trapFocus por defecto true
 */
export function useDialogFocus(open, panelRef, options = {}) {
  const { onClose, trapFocus = true } = options
  const savedActiveRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    if (!open || !panelRef?.current) return
    savedActiveRef.current = document.activeElement
    const panel = panelRef.current
    const nodes = listFocusable(panel)
    const first = nodes[0]
    if (first) {
      first.focus()
    } else {
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
      panel.focus()
    }
  }, [open, panelRef])

  useEffect(() => {
    if (!open) return
    const panel = panelRef?.current
    if (!panel) return

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (!trapFocus || e.key !== 'Tab') return
      if (!panel.contains(document.activeElement)) return
      const nodes = listFocusable(panel)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const prev = savedActiveRef.current
      if (prev instanceof HTMLElement && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch (_) {
          /* ignore */
        }
      }
    }
  }, [open, panelRef, trapFocus])
}
