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
        // Arcade palette from styleguide
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
      },
      fontFamily: {
        display: ['Russo One', 'Impact', 'sans-serif'],
        body: ['Rajdhani', 'Roboto Condensed', 'sans-serif'],
      },
      borderRadius: {
        'arcade': '4px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      letterSpacing: {
        'arcade': '-0.02em',
      },
    },
  },
  plugins: [],
};
export default config;
