/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clave de API integrada en la compilación. Ver `.env.example`. */
  readonly VITE_API_KEY?: string;
  readonly VITE_API_PROVIDER?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
