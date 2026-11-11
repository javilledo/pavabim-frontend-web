/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pantone 123 C (Digital #FFC72C) — Amarillo Corporativo Pavasal
        pavasal: {
          50: '#FFFBEB',
          100: '#FFF3C4',
          200: '#FFE588',
          300: '#FFD653',
          400: '#FFD038',
          500: '#FFC72C',
          600: '#E5AB00',
          700: '#B88400',
          800: '#8A6200',
          900: '#5C4100',
          950: '#332300',
        },
        // Escala Negro / Asfalto Técnico Corporativo
        asphalt: {
          50: '#F5F5F6',
          100: '#E5E6E8',
          200: '#CCCDD2',
          300: '#A1A2AA',
          400: '#767780',
          500: '#56575F',
          600: '#3F4047',
          700: '#2A2B30',
          800: '#1C1D21',
          900: '#141417',
          950: '#0B0B0D',
        },
      },
    },
  },
  plugins: [],
};
