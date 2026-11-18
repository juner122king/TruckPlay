import { describe, expect, it } from 'vitest'
import { encodeQr, qrSvgPath } from './qr'

function decodeQrRoundTrip(modules: readonly boolean[], size: number): { mask: number; payload: string } {
  const version = (size - 17) / 4
  const at = (r: number, c: number) => modules[r * size + c]

  // Check 3 finder patterns (7x7 outer ring, 5x5 light ring, 3x3 dark core).
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const expected = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        expect(at(top + r, left + c), `finder (${top},${left})`).toBe(expected)
      }
    }
  }
  expect(at(size - 8, 8)).toBe(true)

  // Read top-left and split format info copies and confirm both match.
  const coords1: readonly [number, number][] = [
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
  let fmt1 = 0
  let fmt2 = 0
  for (let i = 0; i < 15; i++) {
    fmt1 = (fmt1 << 1) | (at(coords1[i][0], coords1[i][1]) ? 1 : 0)
    const [r2, c2] = i < 7 ? [size - 1 - i, 8] : [8, size - 15 + i]
    fmt2 = (fmt2 << 1) | (at(r2, c2) ? 1 : 0)
  }
  expect(fmt1).toBe(fmt2)
  const unmaskedFmt = fmt1 ^ 0x5412
  // Check BCH(15,5) remainder is zero.
  let bch = unmaskedFmt
  for (let bit = 14; bit >= 10; bit--) {
    if ((bch >> bit) & 1) bch ^= 0x537 << (bit - 10)
  }
  expect(bch).toBe(0)
  const ecLevel = unmaskedFmt >> 13
  expect(ecLevel).toBe(0) // Level M
  const mask = (unmaskedFmt >> 10) & 7

  // Mark function/reserved cells independently to reconstruct data bits.
  const reserved = new Array<boolean>(size * size).fill(false)
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr
        const c = left + dc
        if (r >= 0 && r < size && c >= 0 && c < size) reserved[r * size + c] = true
      }
    }
  }
  const alignTable: readonly (readonly number[])[] = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ]
  for (const cr of alignTable[version - 1]) {
    for (const cc of alignTable[version - 1]) {
      if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 8) || (cr >= size - 8 && cc <= 8)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          reserved[(cr + dr) * size + (cc + dc)] = true
        }
      }
    }
  }
  for (let i = 0; i < size; i++) {
    reserved[6 * size + i] = true
    reserved[i * size + 6] = true
  }
  for (let i = 0; i < 9; i++) {
    reserved[8 * size + i] = true
    reserved[i * size + 8] = true
  }
  for (let i = 0; i < 8; i++) {
    reserved[8 * size + (size - 8 + i)] = true
    reserved[(size - 8 + i) * size + 8] = true
  }
  if (version >= 7) {
    for (let a = 0; a < 6; a++) {
      for (let b = size - 11; b < size - 8; b++) {
        reserved[b * size + a] = true
        reserved[a * size + b] = true
      }
    }
  }

  const shouldInvert = (r: number, c: number) => {
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

  const bits: number[] = []
  let dir = -1
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--
    for (let step = 0; step < size; step++) {
      const row = dir < 0 ? size - 1 - step : step
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx
        const idx = row * size + c
        if (reserved[idx]) continue
        bits.push(at(row, c) !== shouldInvert(row, c) ? 1 : 0)
      }
    }
    dir = -dir
  }

  const totalCodewords = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346][version - 1]
  const codewords = new Uint8Array(totalCodewords)
  for (let i = 0; i < totalCodewords; i++) {
    let v = 0
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b]
    codewords[i] = v
  }

  // Verify Version info BCH(18,6) and alignment patterns on larger versions.
  if (version >= 7) {
    let verA = 0
    let verB = 0
    for (let i = 17; i >= 0; i--) {
      const a = Math.floor(i / 3)
      const b = size - 11 + (i % 3)
      verA = (verA << 1) | (at(b, a) ? 1 : 0)
      verB = (verB << 1) | (at(a, b) ? 1 : 0)
    }
    expect(verA).toBe(verB)
    expect(verA >> 12).toBe(version)
    let rem = verA
    for (let bit = 17; bit >= 12; bit--) {
      if ((rem >> bit) & 1) rem ^= 0x1f25 << (bit - 12)
    }
    expect(rem).toBe(0)
  }

  for (const cr of alignTable[version - 1]) {
    for (const cc of alignTable[version - 1]) {
      if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 8) || (cr >= size - 8 && cc <= 8)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          expect(at(cr + dr, cc + dc)).toBe(Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
        }
      }
    }
  }

  // De-interleave data + EC codewords according to Version 1..10 M block tables.
  const blockSpecs: readonly [number, number, number, number, number][] = [
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
  ]
  const [ecPerBlock, g1b, g1d, g2b, g2d] = blockSpecs[version - 1]
  const blocks: number[][] = [
    ...Array.from({ length: g1b }, () => [] as number[]),
    ...Array.from({ length: g2b }, () => [] as number[]),
  ]
  const blockLens = [...Array.from({ length: g1b }, () => g1d), ...Array.from({ length: g2b }, () => g2d)]
  let cursor = 0
  const maxLen = Math.max(g1d, g2d)
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blockLens[b]) blocks[b].push(codewords[cursor++])
    }
  }
  const fullBlocks: number[][] = blocks.map((b) => [...b])
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < fullBlocks.length; b++) {
      fullBlocks[b].push(codewords[cursor++])
    }
  }
  expect(cursor).toBe(totalCodewords)

  // Verify Reed-Solomon syndrome = 0 at alpha^0 .. alpha^(ecPerBlock-1) in GF(256).
  const gfExp = new Uint8Array(512)
  const gfLog = new Uint8Array(256)
  for (let i = 0, x = 1; i < 255; i++) {
    gfExp[i] = x
    gfLog[x] = i
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0)
  }
  for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255]
  for (const full of fullBlocks) {
    for (let root = 0; root < ecPerBlock; root++) {
      const alpha = gfExp[root]
      let acc = 0
      for (const coef of full) {
        acc = (acc === 0 ? 0 : gfExp[gfLog[acc] + gfLog[alpha]]) ^ coef
      }
      expect(acc).toBe(0)
    }
  }
  const dataStream = blocks.flat()
  const dataBits: number[] = []
  for (const byte of dataStream) {
    for (let b = 7; b >= 0; b--) dataBits.push((byte >> b) & 1)
  }

  const readBits = (start: number, count: number) => {
    let val = 0
    for (let i = 0; i < count; i++) val = (val << 1) | dataBits[start + i]
    return val
  }
  const mode = readBits(0, 4)
  expect(mode).toBe(0b0100)
  const countBits = version <= 9 ? 8 : 16
  const byteLen = readBits(4, countBits)
  const out = new Uint8Array(byteLen)
  let pos = 4 + countBits
  for (let i = 0; i < byteLen; i++) {
    out[i] = readBits(pos, 8)
    pos += 8
  }
  return { mask, payload: new TextDecoder().decode(out) }
}

describe('QR encoder', () => {
  it('encodes LAN pairing URLs into standard Version 4/5 matrices and round-trips exact bytes', () => {
    const url = 'http://192.168.112.162:8765/?token=0123456789abcdef0123456789abcdef'
    const qr = encodeQr(url)
    expect(qr.size).toBe(37)
    const decoded = decodeQrRoundTrip(qr.modules, qr.size)
    expect(decoded.payload).toBe(url)

    const svgPath = qrSvgPath(qr, 4)
    expect(svgPath.startsWith('M4,4h7v1h-7z')).toBe(true)
  })

  it('supports payloads across Versions 1 through 10', () => {
    for (const sample of [
      'http://10.0.0.2',
      'http://192.168.1.100:8765/?token=a',
      'http://192.168.1.100:8765/?token=' + 'f'.repeat(80),
      'x'.repeat(180),
      'y'.repeat(210),
    ]) {
      const qr = encodeQr(sample)
      expect(decodeQrRoundTrip(qr.modules, qr.size).payload).toBe(sample)
    }
  })

  it('rejects oversized payloads clearly', () => {
    expect(() => encodeQr('z'.repeat(220))).toThrow(/QR payload too long/)
  })
})
