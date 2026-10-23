export type ThemeMode = "light" | "dark";

export const palettes = {
  dark: {
    background: "#050505", surface: "#090909", raised: "#171717",
    text: "#f2f2f2", icon: "#ffffff", muted: "#ababab", border: "#333333", input: "#101010",
    fieldBorder: "#ffffff", progressTrack: "#ababab", brand: "#009999", tint: "#102626", error: "#ff9494", success: "#83e0ad",
    white: "#ffffff", black: "#000000", scrim: "rgba(0,0,0,0.6)", previewMuted: "#99aaaa",
  },
  light: {
    background: "#eef1f6", surface: "#ffffff", raised: "#f5f7fb",
    text: "#18202d", icon: "#000000", muted: "#596579", border: "#ccd4df", input: "#f5f7fb",
    fieldBorder: "#596579", progressTrack: "#596579", brand: "#009999", tint: "#e5f5f5", error: "#b42323", success: "#157a43",
    white: "#ffffff", black: "#000000", scrim: "rgba(0,0,0,0.6)", previewMuted: "#99aaaa",
  },
};

export type Palette = typeof palettes.dark;