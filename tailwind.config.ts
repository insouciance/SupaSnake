import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Arcade palette from styleguide (OG SNAKE style guide v1.0)
        'scale-blue': '#232C33',
        'venom-orange': '#D98324',
        'strike-red': '#A42424',
        'bone-white': '#F4F4F4',
        'beige': '#D1BFA8',
        // Lighter/darker variants for borders
        'scale-blue-light': '#3a4750',
        'scale-blue-dark': '#1a2128',
        'venom-orange-light': '#e69a3a',
        'venom-orange-dark': '#b86d1a',
        // Void: the game scene's near-black backdrop, now the app backdrop
        'void': '#0a0e12',
        'void-deep': '#050508',
        // Dynasty identities (match ThemeManager / DB dynasty colors)
        'cyber': { DEFAULT: '#00FFFF', dim: '#0e7490', glow: '#67e8f9' },
        'primal': { DEFAULT: '#4a7c2a', dim: '#2d5016', glow: '#86efac' },
        'cosmic': { DEFAULT: '#a855f7', dim: '#6A0DAD', glow: '#FFD700' },
        // Rarity scale (cards, borders, celebrations)
        'rarity-common': '#9ca3af',
        'rarity-uncommon': '#4ade80',
        'rarity-rare': '#38bdf8',
        'rarity-epic': '#a78bfa',
        'rarity-legendary': '#fbbf24',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Russo One', 'Impact', 'sans-serif'],
        body: ['var(--font-body)', 'Rajdhani', 'Roboto Condensed', 'sans-serif'],
      },
      borderRadius: {
        'arcade': '4px',
      },
      letterSpacing: {
        'arcade': '-0.02em',
        'wide-arcade': '0.12em',
      },
      boxShadow: {
        // Emissive glow scale - pair with a color: shadow-glow shadow-venom-orange/40
        'glow-sm': '0 0 8px 0 var(--tw-shadow-color)',
        'glow': '0 0 16px 0 var(--tw-shadow-color)',
        'glow-lg': '0 0 32px 4px var(--tw-shadow-color)',
        'glow-inset': 'inset 0 0 12px 0 var(--tw-shadow-color)',
        // Panel elevation over the void
        'panel': '0 4px 24px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'panel-gradient': 'linear-gradient(160deg, rgba(58,71,80,0.35) 0%, rgba(26,33,40,0.9) 55%, rgba(10,14,18,0.95) 100%)',
        'cta-gradient': 'linear-gradient(180deg, #e69a3a 0%, #D98324 55%, #b86d1a 100%)',
        'danger-gradient': 'linear-gradient(180deg, #c53030 0%, #A42424 60%, #7f1d1d 100%)',
        'shimmer': 'linear-gradient(110deg, transparent 30%, rgba(244,244,244,0.12) 50%, transparent 70%)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.02)', opacity: '0.92' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 12px 0 var(--tw-shadow-color)' },
          '50%': { boxShadow: '0 0 28px 4px var(--tw-shadow-color)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '60%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(24px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
        'breathe': 'breathe 3.2s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 2.8s linear infinite',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'fade-up': 'fade-up 0.4s ease-out both',
        'slide-in-right': 'slide-in-right 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
