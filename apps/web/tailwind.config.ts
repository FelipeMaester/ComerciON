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
          // Para a marca usada como cor de TEXTO sobre a superfície. Use esta,
          // não a `marca` crua: a crua é a cor escolhida pela loja e pode não
          // ter contraste com o fundo.
          legivel: cor('--marca-legivel'),
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
        // Repouso e hover de um cartão clicável: o salto é de sombra, não de
        // tamanho — cartão que cresce empurra os vizinhos e a linha "pula".
        elevado: '0 2px 4px -1px rgb(15 23 42 / 0.06), 0 12px 20px -8px rgb(15 23 42 / 0.16)',
        flutuante: '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 12px 24px -8px rgb(15 23 42 / 0.14)',
        // Sombra tingida com a cor da loja, para o botão principal. Usa a
        // variável, então acompanha a marca do tenant e o tema.
        marca: '0 1px 2px rgb(var(--marca-solida) / 0.35), 0 8px 16px -6px rgb(var(--marca-solida) / 0.45)',
      },
      keyframes: {
        aparecer: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Entrada do conteúdo da página: um pouco mais de deslocamento que o
        // `aparecer`, que é usado em elemento pequeno (menu, balão).
        surgir: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        pulsar: {
          '50%': { opacity: '0.45' },
        },
        // Faixa de luz atravessando o esqueleto. Diz "está vindo" melhor que
        // um bloco piscando, que parece erro.
        brilho: {
          '100%': { transform: 'translateX(100%)' },
        },
        // O traço do gráfico se desenhando da esquerda para a direita.
        desenhar: {
          from: { 'stroke-dashoffset': 'var(--comprimento)' },
          to: { 'stroke-dashoffset': '0' },
        },
        subirBalao: {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        aparecer: 'aparecer 0.18s ease-out',
        surgir: 'surgir 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        pulsar: 'pulsar 1.4s ease-in-out infinite',
        brilho: 'brilho 1.6s ease-in-out infinite',
        desenhar: 'desenhar 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        balao: 'subirBalao 0.14s ease-out',
      },
      transitionTimingFunction: {
        // Desaceleração forte no fim: o movimento chega e para, em vez de
        // deslizar. É o que faz um clique parecer responsivo.
        saida: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
