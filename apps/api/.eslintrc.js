module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2021 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, jest: true, es2021: true },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // Três exceções que não são desleixo, e sim como o código diz o que quer:
    //
    // - ignoreRestSiblings: o jeito de tirar a senha da resposta é
    //   desestruturar e ficar com o resto ("const { passwordHash, ...rest }").
    //   Sem esta opção, o lint acusa justamente a linha que PROTEGE o segredo —
    //   e a correção óbvia, apagar a variável, devolveria o hash da senha ao
    //   cliente.
    // - argsIgnorePattern: implementação de interface às vezes ignora um
    //   parâmetro de propósito (o provedor de IA de mentira não usa nenhum). O
    //   sublinhado é a forma consagrada de dizer "sei que não uso".
    // - caughtErrorsIgnorePattern: há "catch" que só existe para a exceção não
    //   subir; o erro em si não interessa.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        ignoreRestSiblings: true,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
};
