# @file-viewer/renderer-pdf

Flyfish File Viewer 的独立 PDF renderer 包，基于 PDF.js，提供 PDF 页面渲染、导航、目录、搜索、缩放、打印和 HTML 导出能力。

## 用法

```ts
import FileViewer from '@file-viewer/vue3'
import { pdfRenderer } from '@file-viewer/renderer-pdf'

const options = {
  rendererMode: 'replace',
  renderers: pdfRenderer,
}
```

也可以和其他 renderer 一起组合：

```ts
const options = {
  rendererMode: 'replace',
  renderers: [pdfRenderer],
}
```

## 离线资源

PDF 预览依赖 PDF.js worker、cMaps、WASM、standard fonts，以及未嵌入中文字体的离线回退资源。资源路径沿用 `@file-viewer/core` 的统一 options：

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

默认未显式配置时，渲染器会基于当前文档 `baseURI` 探测 `vendor/pdf/pdf.worker.mjs`，因此 Vite/UMI 等项目部署在 `/workspace/` 这类子路径时会请求 `/workspace/vendor/pdf/pdf.worker.mjs`，不会强制落到站点根路径。如果客户项目没有执行 `file-viewer-copy-assets`、没有使用 `@file-viewer/vite-plugin`，或者本地临时服务器把该路径回退成 HTML，PDF renderer 会自动懒加载包内 PDF.js worker handler 作为兼容兜底，避免 `Setting up fake worker failed` 直接中断预览。需要最佳性能、完整 cMap/standard fonts/WASM 解码或严格离线部署时，仍建议复制 viewer assets 并配置真实静态地址。当前锁定的 PDF.js 5.4 稳定线会通过 `wasmUrl` 本地加载 JBIG2、JPEG 2000、颜色管理等辅助资源；这些资源由 viewer assets 和 Vite 插件统一复制，不依赖公网。

`cjkFontFallback` 默认开启。PDF 引用了 `MicrosoftYaHei-Bold`、宋体、黑体或其他中文字体但没有嵌入字体数据时，渲染器优先使用本机字体；本机缺失时，会把原 PDF 字体名映射到本地 Noto Sans SC 可变字体，并根据当前页实际文字只加载需要的 WOFF2 分片。首屏会在字体就绪后再渲染，后续页发现新字形时会自动重绘。可设为 `false` 完全关闭，或用 `cjkFontFallbackPath` 指向同结构的自托管字体目录。

## 迁移说明

PDF 渲染已经从 `@file-viewer/core` 移入本包，`pdfjs-dist` 只由 `@file-viewer/renderer-pdf` 声明。只安装 core 或标准组件包时不会再拉取 PDF.js；需要 PDF 预览时请显式装配本 renderer，或使用 `@file-viewer/preset-all`。
