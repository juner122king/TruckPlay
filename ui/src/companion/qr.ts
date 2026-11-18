/**
 * Minimal, dependency-free ISO/IEC 18004 QR Code encoder (Versions 1–10, Error Correction Level M, Byte mode).
 * Designed for LAN pairing URLs in the Companion Setup panel so no external QR runtime dependency is needed.
 */

export interface QrMatrix {
  readonly size: number
  readonly modules: readonly boolean[]
}

interface VersionSpec {
  readonly total: number
  readonly ecPerBlock: number
  readonly g1Blocks: number
  readonly g1Data: number
  readonly g2Blocks: number
  readonly g2Data: number
  readonly align: readonly number[]
}

// ISO/IEC 18004 Table 9 & Annex E for Versions 1..10, Error Correction Level M.
const VERSIONS_M: readonly VersionSpec[] = [
  { total: 26, ecPerBlock: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0, align: [] },
  { total: 44, ecPerBlock: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0, align: [6, 18] },
  { total: 70, ecPerBlock: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0, align: [6, 22] },
  { total: 100, ecPerBlock: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0, align: [6, 26] },
  { total: 134, ecPerBlock: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0, align: [6, 30] },
  { total: 172, ecPerBlock: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0, align: [6, 34] },
  { total: 196, ecPerBlock: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0, align: [6, 22, 38] },
  { total: 242, ecPerBlock: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39, align: [6, 24, 42] },
  { total: 292, ecPerBlock: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37, align: [6, 26, 46] },
  { total: 346, ecPerBlock: 26, g1Blocks: 4, g1Data: 43, g2Blocks: 1, g2Data: 44, align: [6, 28, 50] },
]

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x >= 256) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    const root = GF_EXP[i]
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], root)
    }
    poly = next
  }
  return poly
}

function rsRemainder(data: Uint8Array, ecCount: number, gen: Uint8Array): Uint8Array {
  const work = new Uint8Array(data.length + ecCount)
  work.set(data)
  for (let i = 0; i < data.length; i++) {
    const factor = work[i]
    if (factor === 0) continue
    for (let j = 1; j <= ecCount; j++) {
      work[i + j] ^= gfMul(gen[j], factor)
    }
  }
  return work.slice(data.length)
}

function bchFormatM(mask: number): number {
  // Error correction level M = 00 in QR format bits; mask pattern is 0..7.
  const data = mask & 7
  let rem = data << 10
  for (let bit = 14; bit >= 10; bit--) {
    if ((rem >> bit) & 1) rem ^= 0x537 << (bit - 10)
  }
  return ((data << 10) | rem) ^ 0x5412
}

function bchVersion(version: number): number {
  let rem = version << 12
  for (let bit = 17; bit >= 12; bit--) {
    if ((rem >> bit) & 1) rem ^= 0x1f25 << (bit - 12)
  }
  return (version << 12) | rem
}

function pushBits(bits: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) {
    bits.push((value >> i) & 1)
  }
}

function encodeCodewords(bytes: Uint8Array): { version: number; spec: VersionSpec; codewords: Uint8Array } {
  let chosenVersion = 0
  let chosenSpec: VersionSpec | null = null
  for (let idx = 0; idx < VERSIONS_M.length; idx++) {
    const version = idx + 1
    const spec = VERSIONS_M[idx]
    const dataCount = spec.g1Blocks * spec.g1Data + spec.g2Blocks * spec.g2Data
    const headerBits = 4 + (version <= 9 ? 8 : 16)
    if (headerBits + bytes.length * 8 <= dataCount * 8) {
      chosenVersion = version
      chosenSpec = spec
      break
    }
  }
  if (!chosenSpec) {
    throw new RangeError(`QR payload too long (${bytes.length} bytes exceeds v10-M limit)`)
  }

  const dataCount = chosenSpec.g1Blocks * chosenSpec.g1Data + chosenSpec.g2Blocks * chosenSpec.g2Data
  const maxBits = dataCount * 8
  const bits: number[] = []
  pushBits(bits, 0b0100, 4) // Byte mode
  pushBits(bits, bytes.length, chosenVersion <= 9 ? 8 : 16)
  for (const byte of bytes) pushBits(bits, byte, 8)
  const terminator = Math.min(4, maxBits - bits.length)
  for (let i = 0; i < terminator; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const dataBytes = new Uint8Array(dataCount)
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k]
    dataBytes[i] = b
  }
  for (let i = bits.length / 8, pad = 0; i < dataCount; i++, pad++) {
    dataBytes[i] = pad % 2 === 0 ? 0xec : 0x11
  }

  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  const gen = rsGenerator(chosenSpec.ecPerBlock)
  let offset = 0
  for (let i = 0; i < chosenSpec.g1Blocks; i++) {
    const block = dataBytes.subarray(offset, offset + chosenSpec.g1Data)
    dataBlocks.push(block)
    ecBlocks.push(rsRemainder(block, chosenSpec.ecPerBlock, gen))
    offset += chosenSpec.g1Data
  }
  for (let i = 0; i < chosenSpec.g2Blocks; i++) {
    const block = dataBytes.subarray(offset, offset + chosenSpec.g2Data)
    dataBlocks.push(block)
    ecBlocks.push(rsRemainder(block, chosenSpec.ecPerBlock, gen))
    offset += chosenSpec.g2Data
  }

  const codewords = new Uint8Array(chosenSpec.total)
  let out = 0
  const maxDataLen = Math.max(chosenSpec.g1Data, chosenSpec.g2Data)
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) codewords[out++] = block[i]
    }
  }
  for (let i = 0; i < chosenSpec.ecPerBlock; i++) {
    for (const ec of ecBlocks) {
      codewords[out++] = ec[i]
    }
  }
  return { version: chosenVersion, spec: chosenSpec, codewords }
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0
    case 1:
      return r % 2 === 0
    case 2:
      return c % 3 === 0
    case 3:
      return (r + c) % 3 === 0
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function penaltyScore(modules: boolean[], size: number): number {
  let score = 0
  const at = (r: number, c: number) => modules[r * size + c]

  // N1: 5+ consecutive modules of same color in rows and columns.
  for (let r = 0; r < size; r++) {
    let rowRun = 0
    let rowColor = false
    let colRun = 0
    let colColor = false
    for (let c = 0; c < size; c++) {
      const rv = at(r, c)
      if (c > 0 && rv === rowColor) {
        rowRun++
        if (rowRun === 5) score += 3
        else if (rowRun > 5) score += 1
      } else {
        rowColor = rv
        rowRun = 1
      }
      const cv = at(c, r)
      if (c > 0 && cv === colColor) {
        colRun++
        if (colRun === 5) score += 3
        else if (colRun > 5) score += 1
      } else {
        colColor = cv
        colRun = 1
      }
    }
  }

  // N2: 2x2 blocks of same color.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c)
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) {
        score += 3
      }
    }
  }

  // N3: 1:1:3:1:1 finder-like ratio preceded or followed by 4 light modules.
  const hasFinderLike = (line: (i: number) => boolean) => {
    let count = 0
    for (let i = 0; i <= size - 11; i++) {
      const matchA =
        line(i) &&
        !line(i + 1) &&
        line(i + 2) &&
        line(i + 3) &&
        line(i + 4) &&
        !line(i + 5) &&
        line(i + 6) &&
        !line(i + 7) &&
        !line(i + 8) &&
        !line(i + 9) &&
        !line(i + 10)
      const matchB =
        !line(i) &&
        !line(i + 1) &&
        !line(i + 2) &&
        !line(i + 3) &&
        line(i + 4) &&
        !line(i + 5) &&
        line(i + 6) &&
        line(i + 7) &&
        line(i + 8) &&
        !line(i + 9) &&
        line(i + 10)
      if (matchA || matchB) count += 40
    }
    return count
  }
  for (let r = 0; r < size; r++) {
    score += hasFinderLike((c) => at(r, c))
    score += hasFinderLike((c) => at(c, r))
  }

  // N4: dark module percentage deviation from 50%.
  let dark = 0
  for (const m of modules) if (m) dark++
  const percent = (dark * 100) / (size * size)
  const k = Math.floor(Math.abs(percent - 50) / 5)
  score += k * 10
  return score
}

function placeFunctionPatterns(version: number, spec: VersionSpec, size: number) {
  const modules = new Array<boolean>(size * size).fill(false)
  const reserved = new Array<boolean>(size * size).fill(false)
  const set = (r: number, c: number, dark: boolean) => {
    modules[r * size + c] = dark
    reserved[r * size + c] = true
  }

  // Finder patterns + 1-module white separators.
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ] as const) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr
        const c = left + dc
        if (r < 0 || r >= size || c < 0 || c >= size) continue
        const inFinder = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
        const dark =
          inFinder && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
        set(r, c, dark)
      }
    }
  }

  // Alignment patterns.
  for (const cr of spec.align) {
    for (const cc of spec.align) {
      if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 8) || (cr >= size - 8 && cc <= 8)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
        }
      }
    }
  }

  // Timing strips.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0
    set(6, i, dark)
    set(i, 6, dark)
  }

  // Dark module and format information slots (values filled per mask).
  set(size - 8, 8, true)
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8 * size + i] = true
      reserved[i * size + 8] = true
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8 * size + (size - 8 + i)] = true
    if (i > 0) reserved[(size - 8 + i) * size + 8] = true
  }

  // Version information slots (Versions 7..10).
  if (version >= 7) {
    const info = bchVersion(version)
    for (let i = 0; i < 18; i++) {
      const dark = ((info >> i) & 1) === 1
      const a = Math.floor(i / 3)
      const b = size - 11 + (i % 3)
      set(b, a, dark)
      set(a, b, dark)
    }
  }

  return { modules, reserved }
}

function writeFormat(modules: boolean[], size: number, mask: number): void {
  const format = bchFormatM(mask)
  const topLeft: readonly [number, number][] = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ]
  for (let i = 0; i < 15; i++) {
    const bit = ((format >> (14 - i)) & 1) === 1
    const [r1, c1] = topLeft[i]
    modules[r1 * size + c1] = bit
    if (i < 7) {
      modules[(size - 1 - i) * size + 8] = bit
    } else {
      modules[8 * size + (size - 15 + i)] = bit
    }
  }
}

export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  const { version, spec, codewords } = encodeCodewords(bytes)
  const size = 17 + 4 * version
  const { modules: base, reserved } = placeFunctionPatterns(version, spec, size)

  // Place interleaved codewords along the standard bottom-right zigzag path.
  let bitIdx = 0
  const totalBits = codewords.length * 8
  let dir = -1
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--
    for (let step = 0; step < size; step++) {
      const row = dir < 0 ? size - 1 - step : step
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx
        const idx = row * size + c
        if (reserved[idx]) continue
        if (bitIdx < totalBits) {
          const byte = codewords[bitIdx >> 3]
          const bit = (byte >> (7 - (bitIdx & 7))) & 1
          base[idx] = bit === 1
          bitIdx++
        }
      }
    }
    dir = -dir
  }

  let bestModules = base
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.slice()
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c
        if (!reserved[idx] && maskBit(mask, r, c)) {
          candidate[idx] = !candidate[idx]
        }
      }
    }
    writeFormat(candidate, size, mask)
    const score = penaltyScore(candidate, size)
    if (score < bestScore) {
      bestScore = score
      bestModules = candidate
    }
  }

  return { size, modules: bestModules }
}

/** Merge every dark module into a single SVG path string in quiet-zone coordinates (`0..size+2*margin`). */
export function qrSvgPath(qr: QrMatrix, margin = 4): string {
  const parts: string[] = []
  for (let r = 0; r < qr.size; r++) {
    let c = 0
    while (c < qr.size) {
      if (!qr.modules[r * qr.size + c]) {
        c++
        continue
      }
      const start = c
      while (c < qr.size && qr.modules[r * qr.size + c]) c++
      const width = c - start
      parts.push(`M${start + margin},${r + margin}h${width}v1h-${width}z`)
    }
  }
  return parts.join('')
}
