// Compile-time metadata shown on the About screen.
//
// `__BUILD_TIME__` is injected by Vite via `define` in vite.config.ts at
// build start, so this value is baked into the bundle. It is _not_ updated
// while the app is running.

declare const __BUILD_TIME__: string;

/** ISO-8601 timestamp captured at the moment Vite started the build. */
export const BUILD_NUMBER: string = __BUILD_TIME__;

/** Human-readable system name (also exposed through i18n for translations). */
export const APP_NAME = "Alfred Control Unit";

/** Current app version. Bump on each release. */
export const APP_VERSION = "0.1 (β)";

/** Vendor / manufacturer string shown on the About screen. */
export const MANUFACTURER = "Siemens Healthineers AG";

/**
 * Siemens Healthineers brand promise. Kept in English in every locale by
 * design — it is a globally-recognized brand line, not body copy.
 */
export const BRAND_TAGLINE =
  "We pioneer breakthroughs in healthcare.\nFor everyone. Everywhere. Sustainably.";
