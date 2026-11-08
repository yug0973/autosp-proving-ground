/** Settings read from the environment at build time (`.env.local`, never committed). */
interface ImportMetaEnv {
  /** The Web3Forms access key the pilot form sends with (exhibit/rsvp.ts, and the Annex's modules/apply.ts). */
  readonly VITE_WEB3FORMS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
