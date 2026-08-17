import type { Config } from 'tailwindcss';

/**
 * As cores não são valores fixos aqui: são variáveis CSS declaradas em
 * `globals.css`. É isso que permite duas coisas ao mesmo tempo — o tema
 * claro/escuro trocar sem duplicar cada classe com `dark:`, e a cor da marca
 * da loja (Configurações → cor principal) pintar o painel em tempo de
 * execução, sem recompilar nada.
 *
 * O formato `rgb(var(--x) / <alpha-value>)` é o que faz `bg-marca/10`
 * continuar funcionando: o Tailwind injeta a opacidade no lugar do
 * `<alpha-value>`.
 */
const cor = (variavel: string) => `rgb(var(${variavel}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        fundo: cor('--fundo'),
        superficie: cor('--superficie'),
        realce: cor('--realce'),
        linha: cor('--linha'),
        texto: cor('--texto'),
        suave: cor('--suave'),
        tenue: cor('--tenue'),
        marca: {
          DEFAULT: cor('--marca'),
          solida: cor('--marca-solida'),
          forte: cor('--marca-forte'),
          texto: cor('--marca-texto'),
        },
      },
      fontFamily: {
        // Sem baixar fonte de fora: o build de produção roda em Docker, e uma
        // fonte remota transformaria `next build` numa etapa que depende de
        // rede. A pilha nativa já entrega Segoe UI Variable no Windows e
        // SF Pro no Mac, que é o visual que o sistema operacional usa.
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI Variable Display',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        // Sombras curtas e de baixa opacidade. Sombra forte envelhece a tela;
        // o que dá profundidade aqui é a borda somada a um halo discreto.
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        flutuante: '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 12px 24px -8px rgb(15 23 42 / 0.14)',
      },
      keyframes: {
        aparecer: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        pulsar: {
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        aparecer: 'aparecer 0.18s ease-out',
        pulsar: 'pulsar 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
