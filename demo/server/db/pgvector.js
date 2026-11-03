// pgvector values travel as text: '[0.12,-0.5,...]'.

export function toVectorLiteral(vector) {
  if (!vector) return null
  return '[' + Array.from(vector, (x) => Number(x).toFixed(6)).join(',') + ']'
}

export function parseVector(text) {
  if (text == null) return null
  return Float32Array.from(JSON.parse(text))
}
