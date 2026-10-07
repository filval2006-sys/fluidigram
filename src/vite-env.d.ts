/// <reference types="vite/client" />
declare module 'dejavu-fonts-ttf/ttf/*.ttf?url' {
  const url: string
  export default url
}

/** App version, from package.json. */
declare const __APP_VERSION__: string
