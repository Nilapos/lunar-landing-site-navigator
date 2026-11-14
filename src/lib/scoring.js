// PLACEHOLDER scoring (Quentin). Returns 0..100, higher = better landing site.
// Replace with the real criteria once we decide on the data we use.
export function scoreSite({ slope, lighting, hazards }) {
  const slopeScore = Math.max(0, 1 - slope / 15) // flatter is better
  const lightScore = lighting / 100
  const hazardScore = 1 - hazards
  return 100 * (0.4 * slopeScore + 0.3 * lightScore + 0.3 * hazardScore)
}
