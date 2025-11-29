/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                vastu: {
                    dark: '#422326', // Deep Burgundy/Brown
                    gold: '#CABC90', // Accent Gold
                    light: '#F4F2ED', // Off-white/Cream
                    text: '#2A2A2A', // Dark Text
                    'text-light': '#666666', // Muted Text
                }
            },
            fontFamily: {
                serif: ['"Cormorant Garamond"', 'serif'],
                sans: ['"Inter"', 'sans-serif'],
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                }
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out forwards',
            }
        },
    },
    plugins: [],
}
