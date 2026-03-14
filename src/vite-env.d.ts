interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}