import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0D0D0D',
          900: '#101010',
          850: '#151515',
          800: '#1a1a1a',
          700: '#292929',
          600: '#a1a1aa',
        },
        brand: {
          DEFAULT: '#FF7E1D',
          bright: '#FF8E3A',
          deep: '#FF6D00',
        },
        accent: {
          DEFAULT: '#1c64f2',
          soft: '#3f83f8',
        },
        cream: '#faf9f6',
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
