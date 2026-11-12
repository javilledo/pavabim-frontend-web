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
        // Escala Carbón / Gris Pizarra Oscuro Corporativo
        asphalt: {
          50: '#F5F5F6',
          100: '#E5E6E8',
          200: '#CCCDD2',
          300: '#A5A7B0',
          400: '#7D808A',
          500: '#5D6069',
          600: '#474A52',
          700: '#34373F',
          800: '#26282E',
          900: '#1E1E1E',
          950: '#121212',
        },
      },
    },
  },
  plugins: [],
};
