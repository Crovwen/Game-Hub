/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0B0F1A',
          surface: '#131826',
          card: '#1B2236',
          raised: '#232C45',
        },
        turquoise: {
          DEFAULT: '#00C2B2',
          soft: '#00C2B233',
        },
        gold: {
          DEFAULT: '#F5B841',
          soft: '#F5B84133',
        },
        win: '#3DDC97',
        lose: '#FF5468',
        ink: {
          DEFAULT: '#E9EDF7',
          dim: '#9AA4BF',
          faint: '#5C6785',
        },
      },
      fontFamily: {
        vazir: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(0, 194, 178, 0.45)',
        goldGlow: '0 0 24px -4px rgba(245, 184, 65, 0.45)',
        card: '0 8px 30px -12px rgba(0,0,0,0.55)',
      },
      keyframes: {
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.92) translateY(6px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.22s ease-out',
        shimmer: 'shimmer 1.4s infinite linear',
      },
    },
  },
  plugins: [],
};
