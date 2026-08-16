/**
 * Ambient types for the Vite-specific import forms this project uses.
 *
 * `?raw` yields a module's source text as a string. The 2.7.0 HUD layout contract uses
 * it to assert structural CSS/markup invariants that a `node` test environment cannot
 * observe through layout, without pulling in a DOM implementation or `@types/node`.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}

/**
 * Only the two build-mode flags are declared, rather than referencing `vite/client`
 * wholesale: that package also declares `*?raw`, which would collide with the
 * declaration above.
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
