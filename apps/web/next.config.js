/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Sem output: 'standalone' de propósito. Num monorepo pnpm a saída
  // standalone gera node_modules com symlinks relativos apontando para o
  // store na raiz do workspace (../../../node_modules/.pnpm/...), que não
  // sobrevivem à cópia para dentro da imagem: o container sobe e morre com
  // "Cannot find module 'next'". Testado. A imagem fica ~70 MB maior levando
  // node_modules de produção, e funciona.
};

module.exports = nextConfig;
