import {
  createFileViewerTranslator,
  type FileRenderContext,
  type FileViewerRenderedInstance
} from '@file-viewer/core'
import type Hls from 'hls.js'

const videoStyle = `
.fv-video-viewer{width:100%;min-height:100%;display:flex;align-items:center;justify-content:center;padding:28px;background:#eef1f4;box-sizing:border-box}
.fv-video-shell{width:min(100%,960px);border-radius:8px;border:1px solid rgba(15,23,42,.1);background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.14);overflow:hidden}
.fv-video-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-bottom:1px solid rgba(15,23,42,.08)}
.fv-video-heading span{color:#0f766e;font-size:12px;font-weight:800}
.fv-video-heading strong{color:#132235;font-size:16px}
.fv-video-player{display:block;width:100%;aspect-ratio:16/9;background:#05070a}
.fv-video-hint{margin:0;padding:12px 18px 16px;color:#64748b;font-size:13px;line-height:1.7}
[data-viewer-theme='dark'] .fv-video-viewer{background:#101820;color:#e5eef8}
[data-viewer-theme='dark'] .fv-video-shell{border-color:rgba(148,163,184,.18);background:#111827;box-shadow:0 22px 56px rgba(0,0,0,.32)}
[data-viewer-theme='dark'] .fv-video-heading{border-color:rgba(148,163,184,.18)}
[data-viewer-theme='dark'] .fv-video-heading strong{color:#f8fafc}
[data-viewer-theme='dark'] .fv-video-hint{color:#94a3b8}
@media (prefers-color-scheme:dark){[data-viewer-theme='system'] .fv-video-viewer{background:#101820;color:#e5eef8}[data-viewer-theme='system'] .fv-video-shell{border-color:rgba(148,163,184,.18);background:#111827;box-shadow:0 22px 56px rgba(0,0,0,.32)}[data-viewer-theme='system'] .fv-video-heading{border-color:rgba(148,163,184,.18)}[data-viewer-theme='system'] .fv-video-heading strong{color:#f8fafc}[data-viewer-theme='system'] .fv-video-hint{color:#94a3b8}}
`

const VIDEO_MIME_MAP: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  mp4: 'video/mp4',
  webm: 'video/webm'
}

const createElement = <TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  className?: string,
  text?: string
) => {
  const element = document.createElement(tagName)
  if (className) {
    element.className = className
  }
  if (typeof text === 'string') {
    element.textContent = text
  }
  return element
}

const createStyle = () => {
  const style = document.createElement('style')
  style.textContent = videoStyle
  return style
}

const createRenderedInstance = (
  target: HTMLDivElement,
  cleanup: () => void
): FileViewerRenderedInstance => ({
  $el: target,
  unmount() {
    cleanup()
    target.replaceChildren()
  }
})

const getMimeType = (type: string) => {
  return VIDEO_MIME_MAP[type] || 'video/*'
}

const createLocalUrl = (buffer: ArrayBuffer, type: string) => {
  return URL.createObjectURL(new Blob([buffer], { type: getMimeType(type) }))
}

/**
 * Pure TypeScript video renderer.
 *
 * MP4/WebM use the native `<video>` element. HLS uses native browser support
 * first and imports `hls.js` only when the current browser needs it.
 */
export default async function renderVideo(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
) {
  const t = createFileViewerTranslator(context?.options)
  const normalizedType = (type || 'mp4').toLowerCase()
  let disposed = false
  let objectUrl = ''
  let hls: Hls | null = null

  const root = createElement('div', 'fv-video-viewer')
  const shell = createElement('section', 'fv-video-shell')
  const heading = createElement('div', 'fv-video-heading')
  heading.append(
    createElement('span', '', normalizedType.toUpperCase() || 'VIDEO'),
    createElement('strong', '', t('media.video.title'))
  )

  const video = createElement('video', 'fv-video-player')
  video.controls = true
  video.preload = 'metadata'
  video.textContent = t('media.video.unsupported')
  shell.append(heading, video)

  if (normalizedType === 'm3u8') {
    shell.append(createElement(
      'p',
      'fv-video-hint',
      t('media.video.hlsHint')
    ))
  }

  root.append(shell)
  target.replaceChildren(createStyle(), root)

  const resolveSource = () => {
    if (normalizedType === 'm3u8' && context?.url) {
      return context.url
    }
    objectUrl = createLocalUrl(buffer, normalizedType)
    return objectUrl
  }

  const mountVideo = async () => {
    const source = resolveSource()
    if (normalizedType === 'm3u8') {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source
        video.load()
        await waitForVideoMetadata(video, context?.signal)
        return
      }
      const { default: HlsConstructor } = await import('hls.js')
      if (disposed) {
        return
      }
      if (HlsConstructor.isSupported()) {
        hls = new HlsConstructor({ enableWorker: true, lowLatencyMode: false })
        if (context?.signal?.aborted) {
          throw new DOMException('The video request was aborted.', 'AbortError')
        }
        await new Promise<void>((resolve, reject) => {
          const events = HlsConstructor.Events
          const timeoutId = window.setTimeout(() => {
            cleanupListeners()
            reject(new Error('Timed out while loading the HLS manifest.'))
          }, 30000)
          const onManifest = () => {
            cleanupListeners()
            resolve()
          }
          const onError = (_event: string, data: { fatal?: boolean; details?: string }) => {
            if (!data?.fatal) return
            cleanupListeners()
            reject(new Error(data.details || 'Unable to load the HLS video stream.'))
          }
          const onAbort = () => {
            cleanupListeners()
            reject(new DOMException('The video request was aborted.', 'AbortError'))
          }
          const cleanupListeners = () => {
            window.clearTimeout(timeoutId)
            hls?.off(events.MANIFEST_PARSED, onManifest)
            hls?.off(events.ERROR, onError)
            context?.signal?.removeEventListener('abort', onAbort)
          }
          hls?.on(events.MANIFEST_PARSED, onManifest)
          hls?.on(events.ERROR, onError)
          context?.signal?.addEventListener('abort', onAbort, { once: true })
          hls?.attachMedia(video)
          hls?.loadSource(source)
        })
        await waitForVideoMetadata(video, context?.signal)
        return
      }
      throw new Error('This browser cannot play HLS video.')
    }
    video.src = source
    video.load()
    await waitForVideoMetadata(video, context?.signal)
  }

  const cleanup = () => {
    disposed = true
    hls?.destroy()
    hls = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
    }
  }

  try {
    await mountVideo()
  } catch (error) {
    cleanup()
    target.replaceChildren()
    throw error
  }

  return createRenderedInstance(target, () => {
    cleanup()
  })
}

const waitForVideoMetadata = async (video: HTMLVideoElement, signal?: AbortSignal) => {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return
  if (signal?.aborted) throw new DOMException('The video request was aborted.', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('Timed out while loading video metadata.'))
    }, 30000)
    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(video.error?.message || 'The browser could not decode this video.'))
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('The video request was aborted.', 'AbortError'))
    }
    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('canplay', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
