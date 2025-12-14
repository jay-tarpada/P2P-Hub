/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'brand-accent-purple': '#A855F7',
                'brand-accent-pink': '#EC4899',
                'brand-accent-blue': '#3B82F6',
                'brand-bg': '#18181B',
                'brand-text-primary': '#F4F4F5',
                'brand-text-secondary': '#A1A1AA',
                'brand-border': '#3F3F46',
                'brand-surface': '#27272A'
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto']
            }
        }
    },
    plugins: [
        function ({ addUtilities }) {
            addUtilities({
                '.scrollbar-hide': {
                    /* Firefox */
                    'scrollbar-width': 'none',
                    /* Safari and Chrome */
                    '&::-webkit-scrollbar': {
                        display: 'none'
                    }
                },
                '.scrollbar-custom': {
                    /* Firefox */
                    'scrollbar-width': 'thin',
                    'scrollbar-color': 'rgb(168 85 247 / 0.3) transparent',
                    /* Safari and Chrome */
                    '&::-webkit-scrollbar': {
                        width: '8px'
                    },
                    '&::-webkit-scrollbar-track': {
                        background: 'transparent'
                    },
                    '&::-webkit-scrollbar-thumb': {
                        background: 'linear-gradient(to bottom, rgb(168 85 247 / 0.4), rgb(236 72 153 / 0.4))',
                        borderRadius: '10px',
                        border: '2px solid transparent',
                        backgroundClip: 'padding-box'
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                        background: 'linear-gradient(to bottom, rgb(168 85 247 / 0.6), rgb(236 72 153 / 0.6))',
                        borderRadius: '10px',
                        border: '2px solid transparent',
                        backgroundClip: 'padding-box'
                    }
                }
            })
        }
    ]
}
