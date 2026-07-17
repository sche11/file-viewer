export type SpreadsheetTextEncoding = 'auto' | 'utf-8' | 'gbk' | 'gb18030';

export interface SpreadsheetTextSource {
  fileType?: string;
  filename?: string;
  textEncoding?: SpreadsheetTextEncoding;
}

export interface DecodedSpreadsheetText {
  text: string;
  encoding: 'utf-8' | 'gb18030';
}

export type PreparedSpreadsheetReadInput =
  | {
      kind: 'binary';
      data: ArrayBuffer;
    }
  | {
      kind: 'text';
      data: string;
      encoding: DecodedSpreadsheetText['encoding'];
    };

const TEXT_SPREADSHEET_EXTENSIONS = new Set(['csv', 'tsv']);
const TEXT_SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'text/tab-separated-values',
]);

const normalizeFileType = (value?: string) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .split(/[?#;]/, 1)[0];
};

const getFilenameExtension = (filename?: string) => {
  const clean = String(filename || '').trim().toLowerCase().split(/[?#]/, 1)[0];
  const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  const dot = clean.lastIndexOf('.');
  return dot > slash ? clean.slice(dot + 1) : '';
};

export const isTextSpreadsheetSource = ({
  fileType,
  filename,
}: Pick<SpreadsheetTextSource, 'fileType' | 'filename'>) => {
  const normalizedType = normalizeFileType(fileType);
  if (normalizedType) {
    return TEXT_SPREADSHEET_EXTENSIONS.has(normalizedType) ||
      TEXT_SPREADSHEET_MIME_TYPES.has(normalizedType);
  }
  return TEXT_SPREADSHEET_EXTENSIONS.has(getFilenameExtension(filename));
};

const decodeBytes = (
  bytes: Uint8Array,
  encoding: 'utf-8' | 'gb18030'
) => {
  if (typeof TextDecoder === 'undefined') {
    throw new Error('Spreadsheet text decoding requires the browser TextDecoder API.');
  }

  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch (error) {
    if (encoding === 'gb18030' && error instanceof RangeError) {
      throw new Error(
        'This browser does not provide GB18030 text decoding. Use a current browser or set spreadsheet.textEncoding to "utf-8".'
      );
    }
    throw error;
  }
};

const hasUtf8Bom = (bytes: Uint8Array) => {
  return bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
};

const isContinuationByte = (value: number | undefined) => {
  return value !== undefined && value >= 0x80 && value <= 0xbf;
};

// Validate bytes directly instead of relying on TextDecoder({ fatal: true }).
// Some older WebViews accept TextDecoder but ignore the fatal option, which
// would turn GBK into replacement characters before the GB18030 fallback runs.
export const isValidUtf8 = (bytes: Uint8Array) => {
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first === undefined) {
      return false;
    }
    if (first <= 0x7f) {
      index += 1;
      continue;
    }

    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const fourth = bytes[index + 3];
    if (first >= 0xc2 && first <= 0xdf && isContinuationByte(second)) {
      index += 2;
      continue;
    }
    if (
      first === 0xe0 &&
      second !== undefined && second >= 0xa0 && second <= 0xbf &&
      isContinuationByte(third)
    ) {
      index += 3;
      continue;
    }
    if (
      ((first >= 0xe1 && first <= 0xec) || (first >= 0xee && first <= 0xef)) &&
      isContinuationByte(second) &&
      isContinuationByte(third)
    ) {
      index += 3;
      continue;
    }
    if (
      first === 0xed &&
      second !== undefined && second >= 0x80 && second <= 0x9f &&
      isContinuationByte(third)
    ) {
      index += 3;
      continue;
    }
    if (
      first === 0xf0 &&
      second !== undefined && second >= 0x90 && second <= 0xbf &&
      isContinuationByte(third) &&
      isContinuationByte(fourth)
    ) {
      index += 4;
      continue;
    }
    if (
      first >= 0xf1 && first <= 0xf3 &&
      isContinuationByte(second) &&
      isContinuationByte(third) &&
      isContinuationByte(fourth)
    ) {
      index += 4;
      continue;
    }
    if (
      first === 0xf4 &&
      second !== undefined && second >= 0x80 && second <= 0x8f &&
      isContinuationByte(third) &&
      isContinuationByte(fourth)
    ) {
      index += 4;
      continue;
    }
    return false;
  }
  return true;
};

const normalizeTextEncoding = (
  encoding: SpreadsheetTextEncoding | string | undefined
): SpreadsheetTextEncoding => {
  const normalized = String(encoding || 'auto').trim().toLowerCase().replace('_', '-');
  if (normalized === 'utf8' || normalized === 'utf-8') {
    return 'utf-8';
  }
  if (normalized === 'gbk' || normalized === 'cp936' || normalized === 'gb2312') {
    return 'gbk';
  }
  if (normalized === 'gb18030') {
    return 'gb18030';
  }
  return 'auto';
};

export const decodeSpreadsheetText = (
  data: ArrayBuffer,
  encoding: SpreadsheetTextEncoding = 'auto'
): DecodedSpreadsheetText => {
  const bytes = new Uint8Array(data);
  const normalizedEncoding = normalizeTextEncoding(encoding);

  if (normalizedEncoding === 'utf-8') {
    const content = hasUtf8Bom(bytes) ? bytes.subarray(3) : bytes;
    return { text: decodeBytes(content, 'utf-8'), encoding: 'utf-8' };
  }

  if (normalizedEncoding === 'gbk' || normalizedEncoding === 'gb18030') {
    return { text: decodeBytes(bytes, 'gb18030'), encoding: 'gb18030' };
  }

  if (hasUtf8Bom(bytes)) {
    return { text: decodeBytes(bytes.subarray(3), 'utf-8'), encoding: 'utf-8' };
  }

  return isValidUtf8(bytes)
    ? { text: decodeBytes(bytes, 'utf-8'), encoding: 'utf-8' }
    : { text: decodeBytes(bytes, 'gb18030'), encoding: 'gb18030' };
};

export const prepareSpreadsheetReadInput = (
  data: ArrayBuffer,
  source: SpreadsheetTextSource = {}
): PreparedSpreadsheetReadInput => {
  if (!isTextSpreadsheetSource(source)) {
    return { kind: 'binary', data };
  }

  const decoded = decodeSpreadsheetText(data, source.textEncoding);
  return {
    kind: 'text',
    data: decoded.text,
    encoding: decoded.encoding,
  };
};
