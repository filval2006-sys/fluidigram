import { IT } from './it'

/**
 * Interface language. Source strings in the code are English; `IT` maps each English string to its Italian text.
 * Drawings have their own language (every drawing text is an `{ it, en }` pair), independent from this one.
 */
export type UiLang = 'it' | 'en'
export type LanguagePref = 'auto' | UiLang

let current: UiLang = 'en'

/** Language of the operating system or browser: Italian if it is Italian, English otherwise. */
const systemLanguage = (): UiLang =>
  typeof navigator !== 'undefined' && (navigator.language ?? '').toLowerCase().startsWith('it') ? 'it' : 'en'

export const resolveLanguage = (pref: LanguagePref): UiLang => (pref === 'auto' ? systemLanguage() : pref)

export function setUiLanguage(lang: UiLang): void {
  current = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export const uiLanguage = (): UiLang => current

const fill = (text: string, vars?: Record<string, string | number>): string =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text

/** Translates an English source string; `{name}` placeholders are replaced from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  return fill(current === 'it' ? (IT[text] ?? text) : text, vars)
}

/** Marks a string for translation without translating it now (for constants); translate it later with `t()`. */
export const N_ = (text: string): string => text

/** Plural form: `tp(n, '{n} line', '{n} lines')`. Both forms need an entry in the Italian dictionary. */
export const tp = (n: number, one: string, other: string, vars: Record<string, string | number> = {}): string => t(n === 1 ? one : other, { n, ...vars })
