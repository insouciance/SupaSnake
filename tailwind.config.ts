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
        // INK & AMBER - the styleguide palette, recovered.
        // venom-orange carries Venom Orange again (styleguide/styleguide.md
        // v1.0, warmed to the terrain amber the board already draws). Amber
        // is the product's one semantic warm: "this is yours now" - banked
        // yield, calcified ground, the primary call to action. Cyan is
        // released back to CYBER and means dynasty, never accent.
        'scale-blue': '#16202b',
        'venom-orange': '#f2a03f',
        'strike-red': '#a3324a',
        'bone-white': '#eef3f7',
        'beige': '#94a3b8',
        // Lighter/darker variants for borders
        'scale-blue-light': '#2b3b4d',
        'scale-blue-dark': '#0e141c',
        'venom-orange-light': '#ffc247',
        'venom-orange-dark': '#b4661c',
        // Ink: the outline colour, shared by the board hull pass and the
        // comic text-stroke grammar. Deeper than void-deep on purpose.
        'ink': '#0b1118',
        'slate-deep': '#1c2836',
        // Secondary accent for select highlights (violet pulse)
        'pulse': '#8b5cf6',
        // Void: the game scene's near-black backdrop, now the app backdrop
        'void': '#0a1017',
        'void-deep': '#06090d',
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
        'panel-gradient': 'linear-gradient(160deg, rgba(43,59,77,0.35) 0%, rgba(14,20,28,0.9) 55%, rgba(10,16,23,0.95) 100%)',
        'cta-gradient': 'linear-gradient(180deg, #ffc247 0%, #f2a03f 55%, #b4661c 100%)',
        'danger-gradient': 'linear-gradient(180deg, #c9455e 0%, #a3324a 60%, #5d1a29 100%)',
        'shimmer': 'linear-gradient(110deg, transparent 30%, rgba(230,237,243,0.12) 50%, transparent 70%)',
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
