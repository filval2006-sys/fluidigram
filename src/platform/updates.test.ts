import { describe, expect, it } from 'vitest'
import { compareVersions, detectPlatform, parseRelease } from './updates'

describe('update check', () => {
  it('compares versions numerically, not as text', () => {
    expect(compareVersions('0.4.1', '0.4.0')).toBeGreaterThan(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('v1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('0.4.0', '0.4.0')).toBe(0)
    expect(compareVersions('0.4', '0.4.0')).toBe(0)
    expect(compareVersions('0.3.9', '0.4.0')).toBeLessThan(0)
  })
  it('a pre-release is older than the same release', () => {
    expect(compareVersions('0.5.0-beta.1', '0.5.0')).toBeLessThan(0)
    expect(compareVersions('0.5.0', '0.5.0-beta.1')).toBeGreaterThan(0)
  })
  it('detects the system from the user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other')
  })
  const release = {
    tag_name: 'v0.4.1',
    html_url: 'https://github.com/filval2006-sys/fluidigram/releases/tag/v0.4.1',
    assets: [
      { name: 'Fluidigram_0.4.1_macOS.pkg', browser_download_url: 'https://example.test/mac.pkg' },
      { name: 'Fluidigram_0.4.1_x64-setup.exe', browser_download_url: 'https://example.test/win.exe' },
      { name: 'Fluidigram_universal.app.tar.gz', browser_download_url: 'https://example.test/app.tgz' },
    ],
  }
  it('picks the installer for the system', () => {
    expect(parseRelease(release, 'mac')).toEqual({ version: '0.4.1', url: release.html_url, downloadUrl: 'https://example.test/mac.pkg' })
    expect(parseRelease(release, 'windows')?.downloadUrl).toBe('https://example.test/win.exe')
    expect(parseRelease(release, 'other')?.downloadUrl).toBeNull()
  })
  it('rejects answers that are not a release', () => {
    expect(parseRelease(null, 'mac')).toBeNull()
    expect(parseRelease({ message: 'Not Found' }, 'mac')).toBeNull()
    expect(parseRelease({ tag_name: 'v1' }, 'mac')).toBeNull()
  })
})
