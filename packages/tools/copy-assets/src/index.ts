import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CopyFileViewerAssetsOptions {
  /** Target static directory. Defaults to public/file-viewer in the invoking project. */
  targetDir?: string
  /** Clear the target before copying. Defaults to true. */
  clean?: boolean
}

export interface ViewerAssetValidationItem {
  id: string
  rendererId: string
  kind: string
  target: string
  required: boolean
  relativePath: string
  exists: boolean
  description: string
}

export interface CopyFileViewerAssetsResult {
  sourceDir: string
  targetDir: string
  assetBaseUrl: string
  assetManifestPath: string
  validation: {
    valid: boolean
    checkedAt: string
    assets: ViewerAssetValidationItem[]
    missingRequired: ViewerAssetValidationItem[]
    missingOptional: ViewerAssetValidationItem[]
  }
}

interface BundledAssetManifest {
  schemaVersion: number
  rendererAssetManifests: Array<{
    rendererId: string
    assets: Array<{
      id: string
      rendererId: string
      kind: string
      target: string
      required: boolean
      defaultPath?: string
      description: string
    }>
  }>
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundledViewerDir = resolve(packageDir, 'viewer')
const manifestFilename = 'flyfish-viewer-assets.json'

const removeMacMetadata = async (directory: string): Promise<void> => {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name)
    if (entry.name === '.DS_Store') {
      await rm(path, { force: true })
    } else if (entry.isDirectory()) {
      await removeMacMetadata(path)
    }
  }))
}

const isExpectedAssetKind = (
  kind: string,
  pathStat: { isDirectory(): boolean; isFile(): boolean }
) => {
  return kind === 'directory' || kind === 'wasm-directory'
    ? pathStat.isDirectory()
    : pathStat.isFile()
}

const validateCopiedAssets = async (
  targetDir: string,
  manifest: BundledAssetManifest
): Promise<CopyFileViewerAssetsResult['validation']> => {
  const assets = await Promise.all(
    manifest.rendererAssetManifests
      .flatMap(renderer => renderer.assets)
      .filter(asset => asset.target === 'public' && asset.defaultPath)
      .map(async asset => {
        const relativePath = asset.defaultPath || ''
        let exists = false
        try {
          exists = isExpectedAssetKind(
            asset.kind,
            await stat(resolve(targetDir, relativePath))
          )
        } catch {
          exists = false
        }
        return {
          id: asset.id,
          rendererId: asset.rendererId,
          kind: asset.kind,
          target: asset.target,
          required: asset.required,
          relativePath,
          exists,
          description: asset.description
        }
      })
  )
  const missingRequired = assets.filter(asset => asset.required && !asset.exists)
  const missingOptional = assets.filter(asset => !asset.required && !asset.exists)
  return {
    valid: missingRequired.length === 0,
    checkedAt: new Date().toISOString(),
    assets,
    missingRequired,
    missingOptional
  }
}

export interface ParsedCopyAssetsCliArguments {
  mode: 'copy' | 'help' | 'version'
  targetDir?: string
  clean: boolean
}

export const parseCopyAssetsCliArguments = (
  args: string[]
): ParsedCopyAssetsCliArguments => {
  let mode: ParsedCopyAssetsCliArguments['mode'] = 'copy'
  let targetDir: string | undefined
  let clean = true

  for (const argument of args) {
    if (argument === '--help' || argument === '-h') {
      mode = 'help'
      continue
    }
    if (argument === '--version' || argument === '-v') {
      mode = 'version'
      continue
    }
    if (argument === '--no-clean') {
      clean = false
      continue
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`)
    }
    if (targetDir) {
      throw new Error(`Only one target directory is supported, received: ${argument}`)
    }
    targetDir = argument
  }

  return { mode, targetDir, clean }
}

export const copyFileViewerAssets = async (
  options: CopyFileViewerAssetsOptions = {}
): Promise<CopyFileViewerAssetsResult> => {
  const configuredTarget = options.targetDir || process.env.FILE_VIEWER_PUBLIC_DIR
  const targetDir = resolve(
    configuredTarget ||
      resolve(process.env.INIT_CWD || process.cwd(), 'public/file-viewer')
  )
  if (!existsSync(bundledViewerDir)) {
    throw new Error(`Missing bundled viewer assets: ${bundledViewerDir}`)
  }

  const manifest = JSON.parse(
    await readFile(resolve(bundledViewerDir, manifestFilename), 'utf8')
  ) as BundledAssetManifest
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported viewer asset manifest schema: ${manifest.schemaVersion}`)
  }

  if (options.clean !== false) {
    await rm(targetDir, { recursive: true, force: true })
  }
  await mkdir(targetDir, { recursive: true })
  await cp(bundledViewerDir, targetDir, { recursive: true, force: true })
  await removeMacMetadata(targetDir)

  const validation = await validateCopiedAssets(targetDir, manifest)
  const assetManifestPath = resolve(targetDir, manifestFilename)
  await writeFile(
    assetManifestPath,
    `${JSON.stringify({
      ...manifest,
      generatedAt: new Date().toISOString(),
      validation
    }, null, 2)}\n`,
    'utf8'
  )
  if (!validation.valid) {
    throw new Error(
      `Viewer static assets are missing required resources: ${validation.missingRequired
        .map(asset => `${asset.rendererId}:${asset.relativePath}`)
        .join(', ')}`
    )
  }

  return {
    sourceDir: bundledViewerDir,
    targetDir,
    assetBaseUrl: '/file-viewer/',
    assetManifestPath,
    validation
  }
}
