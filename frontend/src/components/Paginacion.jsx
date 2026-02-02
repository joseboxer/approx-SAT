/**
 * Bloque reutilizable de paginación.
 */
function Paginacion({
  inicio,
  fin,
  total,
  pagina,
  totalPaginas,
  setPagina,
  label = 'registros',
}) {
  if (total === 0) return null
  return (
    <div className="pagination">
      <span className="pagination-info">
        Mostrando {inicio + 1}-{Math.min(fin, total)} de {total} {label}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn"
          disabled={pagina <= 1}
          onClick={() => setPagina((p) => p - 1)}
        >
          Anterior
        </button>
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          className="btn"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}

export default Paginacion
