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
        // Escala Carbón / Gris Pizarra Corporativo (dinámica según data-theme)
        asphalt: {
          50: 'rgb(var(--asphalt-50) / <alpha-value>)',
          100: 'rgb(var(--asphalt-100) / <alpha-value>)',
          200: 'rgb(var(--asphalt-200) / <alpha-value>)',
          300: 'rgb(var(--asphalt-300) / <alpha-value>)',
          400: 'rgb(var(--asphalt-400) / <alpha-value>)',
          500: 'rgb(var(--asphalt-500) / <alpha-value>)',
          600: 'rgb(var(--asphalt-600) / <alpha-value>)',
          700: 'rgb(var(--asphalt-700) / <alpha-value>)',
          800: 'rgb(var(--asphalt-800) / <alpha-value>)',
          900: 'rgb(var(--asphalt-900) / <alpha-value>)',
          950: 'rgb(var(--asphalt-950) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
