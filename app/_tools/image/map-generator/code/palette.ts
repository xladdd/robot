// Map colour palette shared by the server renderer, the editor UI, and the
// SVG export. Kept in its own module so client code can use it without
// importing the server-side datasets.
export const mapPalette: Record<string, string> = {
  orange: "#ff9b66",
  teal: "#73d3cf",
  purple: "#aaa0ff",
  pink: "#ed98c0",
  green: "#86bf8d",
  yellow: "#f0ca68",
  blue: "#82b9e8",
  grey: "#c7c7c7",
  red: "#d76555",
  brown: "#a77b58",
};
