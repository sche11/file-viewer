#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  copyFileViewerAssets,
  parseCopyAssetsCliArguments
} from './index.js'

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string }

const help = `file-viewer-copy-assets ${packageJson.version}

Copy Flyfish File Viewer Worker, WASM, font, and vendor assets into a self-hosted web project.

Usage:
  npx --yes file-viewer-copy-assets@${packageJson.version} [target-directory] [--no-clean]

Arguments:
  target-directory  Output directory (default: ./public/file-viewer)

Options:
  --no-clean        Keep existing files in the target directory
  -h, --help        Show this help
  -v, --version     Print the CLI version

Environment:
  FILE_VIEWER_PUBLIC_DIR      Override the target directory
  FILE_VIEWER_SKIP_ASSET_COPY Skip copying when set to 1 or true`

const isTruthy = (value: string | undefined) => value === '1' || value === 'true'

try {
  const parsed = parseCopyAssetsCliArguments(process.argv.slice(2))
  if (parsed.mode === 'help') {
    console.log(help)
    process.exit(0)
  }
  if (parsed.mode === 'version') {
    console.log(packageJson.version)
    process.exit(0)
  }
  if (isTruthy(process.env.FILE_VIEWER_SKIP_ASSET_COPY)) {
    console.log('[file-viewer-copy-assets] skipped by FILE_VIEWER_SKIP_ASSET_COPY')
    process.exit(0)
  }

  const result = await copyFileViewerAssets({
    targetDir: parsed.targetDir,
    clean: parsed.clean
  })
  if (result.validation.missingOptional.length) {
    console.warn(
      `[file-viewer-copy-assets] optional assets missing: ${result.validation.missingOptional
        .map(asset => asset.relativePath)
        .join(', ')}`
    )
  }
  console.log(`[file-viewer-copy-assets] copied assets to ${result.targetDir}`)
  console.log(`[file-viewer-copy-assets] wrote manifest ${result.assetManifestPath}`)
} catch (reason) {
  const message = reason instanceof Error ? reason.message : String(reason)
  console.error(`[file-viewer-copy-assets] ${message}`)
  console.error('Run with --help for usage.')
  process.exit(1)
}
