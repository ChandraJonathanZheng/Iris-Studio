import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        cream: "#EFEAE0",
        ink: "#1C1712",
        plum: "#2E1B6B",
        "plum-light": "#5B4FE0",
        coral: "#F2724A",
        lime: "#C8F169",
        sand: "rgba(255,255,255,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
