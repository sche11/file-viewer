# @file-viewer/renderer-pdf

Standalone PDF renderer package for Flyfish File Viewer. It is powered by PDF.js and provides page rendering, navigation, outline, search, zoom, print, and HTML export support.

## Usage

```ts
import FileViewer from '@file-viewer/vue3'
import { pdfRenderer } from '@file-viewer/renderer-pdf'

const options = {
  rendererMode: 'replace',
  renderers: pdfRenderer,
}
```

You can combine it with other renderer packages:

```ts
const options = {
  rendererMode: 'replace',
  renderers: [pdfRenderer],
}
```

## Offline Assets

PDF preview depends on the PDF.js worker, cMaps, WASM helpers, standard fonts, and an offline fallback for unembedded CJK fonts. Asset paths use the same unified options as `@file-viewer/core`:

```ts
const options = {
  renderers: pdfRenderer,
  pdf: {
    workerUrl: '/vendor/pdf/pdf.worker.mjs',
    cMapUrl: '/vendor/pdf/cmaps/',
    wasmUrl: '/vendor/pdf/wasm/',
    standardFontDataUrl: '/vendor/pdf/standard_fonts/',
    cjkFontFallbackPath: '/vendor/pdf/fonts/',
  },
}
```

When no explicit URL is provided, the renderer resolves `vendor/pdf/pdf.worker.mjs` against the current document `baseURI`. Apps deployed under a subpath such as `/workspace/` therefore request `/workspace/vendor/pdf/pdf.worker.mjs` instead of forcing the site root. If the host app did not run `file-viewer-copy-assets`, does not use `@file-viewer/vite-plugin`, or a local dev server falls back to HTML for that path, the renderer lazy-loads the packaged PDF.js worker handler as a compatibility fallback so preview does not fail with `Setting up fake worker failed`. For best performance, complete cMap/standard-font/WASM decoding, or strict offline deployments, still copy viewer assets and point these URLs at real static files. The pinned PDF.js 5.4 stable line loads local JBIG2, JPEG 2000, color-management, and related helpers through `wasmUrl`; viewer assets and the Vite plugin copy them without relying on the public internet.

`cjkFontFallback` is enabled by default. When a PDF references `MicrosoftYaHei-Bold`, SimSun, SimHei, or another CJK font without embedding the font program, the renderer prefers an installed system font and otherwise aliases the original PDF font name to the bundled Noto Sans SC variable font. Only WOFF2 shards needed by the current page text are loaded. The first page waits for the font before rendering, and later pages are redrawn when they introduce new glyphs. Set the option to `false` to disable this behavior, or point `cjkFontFallbackPath` at a self-hosted directory with the same structure.

## Migration Note

PDF rendering has moved out of `@file-viewer/core` into this package, and `pdfjs-dist` is now declared only by `@file-viewer/renderer-pdf`. Installing core or a standard component package no longer pulls PDF.js; explicitly assemble this renderer when PDF preview is needed, or use `@file-viewer/preset-all`.
