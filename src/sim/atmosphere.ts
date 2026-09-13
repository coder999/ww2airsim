const T0 = 288.15        // K, sea-level standard temperature
const P0 = 101325        // Pa, sea-level standard pressure
const L = 0.0065         // K/m, tropospheric lapse rate
const R = 287.05287      // J/(kg·K), specific gas constant for dry air
const G = 9.80665        // m/s²
const GAMMA = 1.4        // ratio of specific heats
const TROPOPAUSE_M = 11000
const T_TROPOPAUSE = T0 - L * TROPOPAUSE_M     // 216.65 K
const P_TROPOPAUSE = P0 * Math.pow(T_TROPOPAUSE / T0, G / (L * R))

export const temperatureAt = (altitudeM: number): number =>
  altitudeM < TROPOPAUSE_M ? T0 - L * altitudeM : T_TROPOPAUSE

export const pressureAt = (altitudeM: number): number => {
  if (altitudeM < TROPOPAUSE_M) {
    return P0 * Math.pow(temperatureAt(altitudeM) / T0, G / (L * R))
  }
  // Isothermal layer: exponential decay.
  return P_TROPOPAUSE * Math.exp((-G * (altitudeM - TROPOPAUSE_M)) / (R * T_TROPOPAUSE))
}

export const densityAt = (altitudeM: number): number =>
  pressureAt(altitudeM) / (R * temperatureAt(altitudeM))

export const speedOfSoundAt = (altitudeM: number): number =>
  Math.sqrt(GAMMA * R * temperatureAt(altitudeM))
