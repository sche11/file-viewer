const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const publicAssetRoot = path.join(projectRoot, 'public', 'file-viewer')

function packageRoot(packageName) {
  const resolutionPaths = [projectRoot]
  if (packageName === '@file-viewer/ppt') {
    resolutionPaths.push(packageRoot('@file-viewer/renderer-presentation'))
  }

  try {
    return path.dirname(require.resolve(`${packageName}/package.json`, {
      paths: resolutionPaths
    }))
  } catch (error) {
    // @file-viewer/ppt intentionally keeps package.json outside its public
    // exports. Its ESM entry lives at the package root, so resolving that entry
    // is the portable npm/pnpm fallback for this legacy CommonJS copy script.
    try {
      return path.dirname(require.resolve(packageName, { paths: resolutionPaths }))
    } catch {
      throw error
    }
  }
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry)
    const stat = fs.statSync(entryPath)
    if (stat.isDirectory()) {
      removeDir(entryPath)
    } else {
      fs.unlinkSync(entryPath)
    }
  }
  fs.rmdirSync(dir)
}

function copyFile(packageName, fromRelativePath, toRelativePath) {
  const from = path.join(packageRoot(packageName), fromRelativePath)
  const to = path.join(publicAssetRoot, toRelativePath)

  if (!fs.existsSync(from)) {
    throw new Error(`Missing File Viewer asset: ${packageName}/${fromRelativePath}`)
  }

  ensureParent(to)
  fs.copyFileSync(from, to)
  return toRelativePath
}

function copyDir(packageName, fromRelativePath, toRelativePath) {
  const from = path.join(packageRoot(packageName), fromRelativePath)
  const to = path.join(publicAssetRoot, toRelativePath)

  if (!fs.existsSync(from)) {
    throw new Error(`Missing File Viewer asset directory: ${packageName}/${fromRelativePath}`)
  }

  removeDir(to)
  fs.mkdirSync(to, { recursive: true })

  for (const entry of fs.readdirSync(from)) {
    const source = path.join(from, entry)
    const target = path.join(to, entry)
    const stat = fs.statSync(source)
    if (stat.isDirectory()) {
      copyDirFromPath(source, target)
    } else {
      fs.copyFileSync(source, target)
    }
  }

  return `${toRelativePath}/`
}

function copyDirFromPath(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from)) {
    const source = path.join(from, entry)
    const target = path.join(to, entry)
    const stat = fs.statSync(source)
    if (stat.isDirectory()) {
      copyDirFromPath(source, target)
    } else {
      fs.copyFileSync(source, target)
    }
  }
}

const pptRuntimeFiles = [
  'index.mjs',
  'worker.mjs',
  'frame-cache.mjs',
  'ppt-native.wasm',
  'ppt-font-cjk.otf',
  'manifest.json',
  'package.json',
  'LICENSE',
  'NOTICE'
]

removeDir(path.join(publicAssetRoot, 'vendor', 'ppt'))

const copied = [
  copyFile('pdfjs-dist', 'legacy/build/pdf.worker.mjs', 'vendor/pdf/pdf.worker.mjs'),
  copyDir('pdfjs-dist', 'cmaps', 'vendor/pdf/cmaps'),
  copyDir('pdfjs-dist', 'wasm', 'vendor/pdf/wasm'),
  copyDir('pdfjs-dist', 'standard_fonts', 'vendor/pdf/standard_fonts'),
  copyFile('@file-viewer/docx', 'dist/docx-preview.worker.js', 'vendor/docx/docx.worker.js'),
  copyFile('@file-viewer/docx', 'dist/jszip.min.js', 'vendor/docx/jszip.min.js'),
  ...pptRuntimeFiles.map(file => copyFile('@file-viewer/ppt', file, `vendor/ppt/${file}`)),
  copyFile('@file-viewer/pptx', 'dist/worker/pptx.worker.js', 'vendor/pptx/pptx.worker.js'),
  copyDir(
    '@file-viewer/renderer-spreadsheet',
    'dist/spreadsheet/worker/sheetjs',
    'vendor/xlsx'
  )
]

console.log(`Copied ${copied.length} File Viewer asset entries to ${path.relative(projectRoot, publicAssetRoot)}`)
