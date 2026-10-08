/**
 * Update check: asks GitHub for the latest published release and compares it with the running version.
 * It only reads public information and never downloads or installs anything: the user installs the new version.
 */
const RELEASE_API = 'https://api.github.com/repos/filval2006-sys/fluidigram/releases/latest'

export interface LatestRelease {
  /** version without the leading "v", e.g. "0.4.1" */
  version: string
  /** the release page */
  url: string
  /** the installer for this system, if the release has one */
  downloadUrl: string | null
}

export type Platform = 'mac' | 'windows' | 'other'

export const detectPlatform = (ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): Platform =>
  /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'mac' : 'other'

const parts = (v: string): { nums: number[]; pre: boolean } => {
  const [core, pre] = v.replace(/^v/i, '').split('-', 2)
  return { nums: core.split('.').map((x) => parseInt(x, 10) || 0), pre: pre !== undefined }
}

/** Negative if a < b, positive if a > b, 0 if equal (a pre-release is older than the same release). */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length, 3); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d
  }
  return x.pre === y.pre ? 0 : x.pre ? -1 : 1
}

interface ApiRelease { tag_name?: string; html_url?: string; assets?: { name?: string; browser_download_url?: string }[] }

/** Reads the GitHub API answer; null if it does not look like a release. */
export function parseRelease(json: unknown, platform: Platform): LatestRelease | null {
  const r = json as ApiRelease | null
  if (!r || typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') return null
  const suffix = platform === 'mac' ? '.pkg' : platform === 'windows' ? '-setup.exe' : ''
  const asset = suffix ? r.assets?.find((a) => a.name?.endsWith(suffix)) : undefined
  return { version: r.tag_name.replace(/^v/i, ''), url: r.html_url, downloadUrl: asset?.browser_download_url ?? null }
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const latest = parseRelease(await res.json(), detectPlatform())
  if (!latest) throw new Error('Unexpected answer from GitHub')
  return latest
}

/** Opens a page or a download in the system browser (native app) or in a new tab (browser). */
export async function openExternal(url: string): Promise<void> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}
