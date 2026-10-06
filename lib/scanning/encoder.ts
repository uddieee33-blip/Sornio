/**
 * Barcodes — printing rules.
 *
 * Reading a code is easy; *issuing* one is what makes scanning work in a shop
 * that sells loose grain, a boutique that stitches to order, or a mobile shop
 * that keeps its own stock numbers. So DukaanOS ships its own encoders:
 *
 *   • **EAN-13 / EAN-8 / UPC-A** — the retail symbologies. A shop that prints
 *     these is printing a label any scanner in the country already understands.
 *   • **Code 128** — for everything that is not a number: internal codes
 *     (`DK000012345`), supplier references, IMEI stickers, shelf tags.
 *
 * The output is a module array (1 = bar, 0 = space) rather than an image, so the
 * same data can be drawn as SVG at any size, printed, or re-rendered on a thermal
 * label printer without a font or a raster step. Widths follow the published
 * symbol tables: the Code 128 table is the 6-element width sequence per symbol,
 * and the EAN tables are the standard L/G/R element sets.
 */

import { gtinCheckDigit, isValidGtin, normalizeCode, stripAimPrefix } from './barcodes';

export type Symbology = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'CODE128';

export type Caption = {
  text: string;
  /** Module offset the text is centred on. */
  x: number;
};

export type EncodedSymbol = {
  symbology: Symbology;
  /** The data actually encoded, check digit included where the symbology has one. */
  value: string;
  /** One entry per module: 1 is a bar, 0 is a space. Quiet zones are included. */
  modules: number[];
  /** Where the first and last printed bar sit inside `modules`. */
  barStart: number;
  barEnd: number;
  /** Human-readable text under the bars — the thing a cashier reads when a label smudges. */
  captions: Caption[];
  /** Total printed width in modules, quiet zones included. */
  widthModules: number;
};

/** Quiet zones: 11 modules on the left and 7 on the right, per the EAN spec. */
const EAN_QUIET_LEFT = 11;
const EAN_QUIET_RIGHT = 7;

/**
 * EAN left-hand (odd parity) element sets. The right-hand sets are the exact
 * inverse, and the even-parity "G" sets are the right-hand sets reversed —
 * which is why they are derived below rather than typed twice and drifted.
 */
const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const EAN_L_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];
const R = EAN_L.map((pattern) => pattern.replace(/[01]/g, (bit) => (bit === '1' ? '0' : '1')));
const G = R.map((pattern) => [...pattern].reverse().join(''));

const toModules = (elements: string) => [...elements].map((bit) => (bit === '1' ? 1 : 0));

function withQuietZone(modules: number[]): Pick<EncodedSymbol, 'modules' | 'barStart' | 'barEnd' | 'widthModules'> {
  const left = new Array(EAN_QUIET_LEFT).fill(0);
  const right = new Array(EAN_QUIET_RIGHT).fill(0);
  const full = [...left, ...modules, ...right];
  return {
    modules: full,
    barStart: EAN_QUIET_LEFT,
    barEnd: EAN_QUIET_LEFT + modules.length,
    widthModules: full.length,
  };
}

/** EAN-13 from a 12-digit body (check digit is computed) or a full 13-digit code. */
export function encodeEan13(input: string): EncodedSymbol {
  const digits = normalizeCode(input).replace(/\D/g, '');
  const body = digits.length === 13 ? digits.slice(0, 12) : digits;
  if (body.length !== 12) throw new Error('EAN-13 needs 12 digits plus a check digit.');
  if (digits.length === 13 && !isValidGtin(digits)) {
    throw new Error('EAN-13 check digit does not match the digits.');
  }
  const value = `${body}${gtinCheckDigit(body)}`;

  const parity = EAN_L_PARITY[Number(value[0])];
  let pattern = '101';
  for (let index = 0; index < 6; index += 1) {
    const digit = Number(value[index + 1]);
    pattern += parity[index] === 'L' ? EAN_L[digit] : G[digit];
  }
  pattern += '01010';
  for (let index = 7; index < 13; index += 1) {
    pattern += R[Number(value[index])];
  }
  pattern += '101';

  const base = withQuietZone(toModules(pattern));
  return {
    symbology: 'EAN-13',
    value,
    ...base,
    captions: [
      { text: value[0], x: EAN_QUIET_LEFT - 5 },
      { text: value.slice(1, 7), x: EAN_QUIET_LEFT + 3 + 21 },
      { text: value.slice(7), x: EAN_QUIET_LEFT + 3 + 45 + 21 },
    ],
  };
}

/** EAN-8 from a 7-digit body or a full 8-digit code. */
export function encodeEan8(input: string): EncodedSymbol {
  const digits = normalizeCode(input).replace(/\D/g, '');
  const body = digits.length === 8 ? digits.slice(0, 7) : digits;
  if (body.length !== 7) throw new Error('EAN-8 needs 7 digits plus a check digit.');
  if (digits.length === 8 && !isValidGtin(digits)) {
    throw new Error('EAN-8 check digit does not match the digits.');
  }
  const value = `${body}${gtinCheckDigit(body)}`;

  let pattern = '101';
  for (let index = 0; index < 4; index += 1) pattern += EAN_L[Number(value[index])];
  pattern += '01010';
  for (let index = 4; index < 8; index += 1) pattern += R[Number(value[index])];
  pattern += '101';

  const base = withQuietZone(toModules(pattern));
  return {
    symbology: 'EAN-8',
    value,
    ...base,
    captions: [
      { text: value.slice(0, 4), x: EAN_QUIET_LEFT + 3 + 14 },
      { text: value.slice(4), x: EAN_QUIET_LEFT + 3 + 28 + 5 + 14 },
    ],
  };
}

/**
 * UPC-A from an 11-digit body or a full 12-digit code. It is drawn as the
 * equivalent EAN-13 (a leading zero), which is exactly how every modern scanner
 * reads a UPC-A anyway.
 */
export function encodeUpcA(input: string): EncodedSymbol {
  const digits = normalizeCode(input).replace(/\D/g, '');
  const body = digits.length === 12 ? digits.slice(0, 11) : digits;
  if (body.length !== 11) throw new Error('UPC-A needs 11 digits plus a check digit.');
  if (digits.length === 12 && !isValidGtin(digits)) {
    throw new Error('UPC-A check digit does not match the digits.');
  }
  const symbol = encodeEan13(`0${body}`);
  return {
    ...symbol,
    symbology: 'UPC-A',
    value: symbol.value.slice(1),
    captions: [
      { text: symbol.value.slice(1, 2), x: EAN_QUIET_LEFT - 5 },
      { text: symbol.value.slice(2, 7), x: EAN_QUIET_LEFT + 3 + 21 },
      { text: symbol.value.slice(7), x: EAN_QUIET_LEFT + 3 + 45 + 21 },
    ],
  };
}

/**
 * Code 128 symbol widths, values 0…105 (the stop pattern is separate). Each
 * entry is six alternating bar/space widths — three bars, three spaces.
 */
const CODE128_WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232',
] as const;

/** The stop symbol is seven elements wide (four bars, three spaces). */
const CODE128_STOP = '2331112';

const START_B = 104;
const START_C = 105;
const CODE_C = 99;
const CODE_B = 100;

/** Code 128 quiet zones: 10 modules either side, the usual printing minimum. */
const C128_QUIET = 10;

/** Code B values cover printable ASCII: `value = ASCII − 32`. */
export function code128ValueForChar(char: string): number {
  const code = char.charCodeAt(0);
  if (code < 32 || code > 126) return code128ValueForChar('?');
  return code - 32;
}

/** Code B can carry printable ASCII only — everything else becomes `?`. */
export function sanitizeForCode128(value: string): string {
  return [...value].map((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126 ? char : '?';
  }).join('');
}

function runLengthOfDigits(value: string, from: number): number {
  let index = from;
  while (index < value.length && value[index] >= '0' && value[index] <= '9') index += 1;
  return index - from;
}

/**
 * Choose the shortest honest encoding: Code C packs two digits into one symbol,
 * so it is worth switching into for long digit runs (GS1 says 4 at the end of
 * the data, 6 in the middle) and never worth it for short ones. Correctness
 * first, compactness second — labels only get so big.
 */
function code128Symbols(value: string): number[] {
  const symbols: number[] = [];
  const numeric = /^\d+$/.test(value);
  let mode: 'B' | 'C';

  if (numeric && ((value.length === 2) || (value.length >= 4 && value.length % 2 === 0))) {
    symbols.push(START_C);
    mode = 'C';
  } else {
    symbols.push(START_B);
    mode = 'B';
  }

  let index = 0;
  while (index < value.length) {
    if (mode === 'B') {
      const run = runLengthOfDigits(value, index);
      const atEnd = index + run === value.length;
      const threshold = atEnd ? 4 : 6;
      if (run >= threshold && (run % 2 === 0 || !atEnd)) {
        symbols.push(CODE_C);
        mode = 'C';
        continue;
      }
      symbols.push(code128ValueForChar(value[index]));
      index += 1;
      continue;
    }

    // Code C: two digits per symbol. A lone digit (or a letter) sends us back.
    const run = runLengthOfDigits(value, index);
    if (run < 2) {
      symbols.push(CODE_B);
      mode = 'B';
      continue;
    }
    symbols.push(Number(value.slice(index, index + 2)));
    index += 2;
  }

  // Modulo-103 check symbol: start value + Σ(value × position), position from 1.
  const checksum = symbols.reduce(
    (sum, symbol, position) => (position === 0 ? sum : sum + symbol * position),
    symbols[0],
  ) % 103;

  return [...symbols, checksum];
}

function widthsToModules(widths: string): number[] {
  const modules: number[] = [];
  for (let index = 0; index < widths.length; index += 1) {
    const width = Number(widths[index]);
    const isBar = index % 2 === 0;
    for (let unit = 0; unit < width; unit += 1) modules.push(isBar ? 1 : 0);
  }
  return modules;
}

/** Code 128, any printable ASCII. */
export function encodeCode128(input: string): EncodedSymbol {
  const raw = normalizeCode(input);
  if (!raw) throw new Error('Nothing to encode.');
  const value = sanitizeForCode128(stripAimPrefix(raw));

  const patterns = code128Symbols(value).map((symbol) => widthsToModules(CODE128_WIDTHS[symbol]));
  patterns.push(widthsToModules(CODE128_STOP));

  const body = patterns.flat();
  const full = [...new Array(C128_QUIET).fill(0), ...body, ...new Array(C128_QUIET).fill(0)];
  return {
    symbology: 'CODE128',
    value,
    modules: full,
    barStart: C128_QUIET,
    barEnd: C128_QUIET + body.length,
    captions: [{ text: value, x: C128_QUIET + body.length / 2 }],
    widthModules: full.length,
  };
}

/**
 * Pick the right symbology for a value and encode it.
 *
 * Retail GTINs print as EAN/UPC because that is what the label supplier, the
 * scanner and the distributor all expect; everything else — internal codes,
 * shelf tags, supplier references — prints as Code 128.
 */
export function encodeForLabel(input: string): EncodedSymbol {
  const value = stripAimPrefix(normalizeCode(input));
  if (/^\d+$/.test(value)) {
    if (value.length === 13 && isValidGtin(value)) return encodeEan13(value);
    if (value.length === 12 && isValidGtin(value)) return encodeUpcA(value);
    if (value.length === 8 && isValidGtin(value)) return encodeEan8(value);
    // A 12-digit GTIN-shaped value with no valid check digit is still a supply
    // reference worth printing — Code 128 carries it verbatim.
  }
  return encodeCode128(value);
}

/** Can this value be printed as a scannable label at all? */
export function canEncode(input: string): boolean {
  try {
    const symbol = encodeForLabel(input);
    return symbol.value.length > 0 && symbol.barEnd > symbol.barStart;
  } catch {
    return false;
  }
}

/** Suggested module width in px for a label of `targetPx` — clamped to printable sizes. */
export function moduleWidthFor(symbol: EncodedSymbol, targetPx = 320): number {
  return Math.max(1, Math.min(4, Math.floor(targetPx / Math.max(symbol.widthModules, 1))));
}
