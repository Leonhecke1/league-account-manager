/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hex: {
          bg:           "#010a13",
          dark:         "#0a1428",
          darker:       "#091428",
          border:       "#1e3a5c",
          "border-lt":  "#2a4a7f",
          gold:         "#c89b3c",
          "gold-lt":    "#f0e6d3",
          "gold-dim":   "#785a28",
          blue:         "#0bc4e3",
          text:         "#a9b4c8",
          "text-dim":   "#4a5568",
        },
        rank: {
          challenger:   "#f4c874",
          grandmaster:  "#e84057",
          master:       "#9d48e0",
          diamond:      "#576bce",
          emerald:      "#52c469",
          platinum:     "#4a9e8e",
          gold:         "#c89b3c",
          silver:       "#7b8fa5",
          bronze:       "#a06533",
          iron:         "#685c52",
        },
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
