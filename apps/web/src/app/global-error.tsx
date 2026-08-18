'use client';

import { useEffect } from 'react';

/**
 * O último recurso: o próprio layout raiz quebrou.
 *
 * Este arquivo SUBSTITUI o `<html>` e o `<body>` — por isso os escreve de novo
 * e não pode usar nada que dependa do layout (nem os componentes do painel,
 * nem as classes do tema, que vivem no CSS importado por ele).
 *
 * Daí o estilo embutido: é a única tela do sistema que precisa funcionar mesmo
 * quando o CSS não carregou. Cores fixas, sem depender de variável, e nenhuma
 * dependência além do React.
 *
 * Na prática quase nunca aparece. Quando aparece, a alternativa é uma página
 * branca sem uma palavra.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Erro global:', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>O sistema não conseguiu abrir</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569', margin: '0 0 24px' }}>
            A falha foi antes de qualquer tela carregar. Tente de novo; se continuar, avise o suporte com o código
            abaixo.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '10px 18px',
                background: '#0f172a',
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Tentar de novo
            </button>
            {/* Âncora comum, e não o Link do Next: esta tela existe porque a
                aplicação não subiu, então o roteador dela pode não estar de pé.
                Um href simples funciona mesmo assim.

                Esta tela aparece mais do que se imagina: quando a falha
                acontece durante a hidratação, o erro escapa do limite da tela e
                chega aqui — medido, cerca de uma vez a cada seis carregamentos
                diretos de uma tela quebrada. Sem esta saída, restaria digitar o
                endereço na barra. */}
            <a
              href="/dashboard"
              style={{
                borderRadius: 10,
                padding: '10px 18px',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              Ir para o painel
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
              Código para o suporte: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
