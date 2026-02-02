/**
 * Bloque reutilizable: filtrar por columna + ordenar por columna (asc/desc).
 * columnas: array de { label, key } o { label, apiKey }; usa key o apiKey según tenga.
 * idPrefix: prefijo para id de inputs (ej. "rma", "clientes").
 */
function HerramientasTabla({
  columnas,
  columnaFiltro,
  setColumnaFiltro,
  valorFiltro,
  setValorFiltro,
  columnaOrden,
  setColumnaOrden,
  ordenAsc,
  setOrdenAsc,
  onPaginaReset,
  idPrefix = 'tabla',
}) {
  const colVal = (c) => c.key ?? c.apiKey
  const resetPagina = () => onPaginaReset?.(1)

  return (
    <div className="herramientas-rma">
      <div className="herramientas-rma-fila">
        <label htmlFor={`${idPrefix}-filtro`} className="herramientas-rma-label">
          Filtrar por
        </label>
        <select
          id={`${idPrefix}-filtro`}
          value={columnaFiltro}
          onChange={(e) => {
            setColumnaFiltro(e.target.value)
            resetPagina()
          }}
          className="herramientas-rma-select"
        >
          {columnas.map((c) => (
            <option key={colVal(c)} value={colVal(c)}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Buscar..."
          value={valorFiltro}
          onChange={(e) => {
            setValorFiltro(e.target.value)
            resetPagina()
          }}
          className="herramientas-rma-input"
        />
        {valorFiltro && (
          <button
            type="button"
            className="btn btn-limpiar"
            onClick={() => {
              setValorFiltro('')
              resetPagina()
            }}
          >
            Limpiar
          </button>
        )}
      </div>
      <div className="herramientas-rma-fila">
        <label htmlFor={`${idPrefix}-orden`} className="herramientas-rma-label">
          Ordenar por
        </label>
        <select
          id={`${idPrefix}-orden`}
          value={columnaOrden}
          onChange={(e) => {
            setColumnaOrden(e.target.value)
            resetPagina()
          }}
          className="herramientas-rma-select"
        >
          {columnas.map((c) => (
            <option key={colVal(c)} value={colVal(c)}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={ordenAsc ? 'asc' : 'desc'}
          onChange={(e) => {
            setOrdenAsc(e.target.value === 'asc')
            resetPagina()
          }}
          className="herramientas-rma-select"
        >
          <option value="desc">Mayor a menor</option>
          <option value="asc">Menor a mayor</option>
        </select>
      </div>
    </div>
  )
}

export default HerramientasTabla
