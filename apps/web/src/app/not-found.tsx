import Link from 'next/link';
import { TelaDeAviso } from '@/components/TelaDeAviso';

/**
 * Endereço que não existe.
 *
 * Sem este arquivo, o Next mostra a tela dele: "This page could not be found",
 * em inglês, com fundo branco mesmo no tema escuro e sem link nenhum. Num
 * sistema inteiro em português, isso parece o site ter saído do ar — e o mais
 * provável é que seja só um endereço antigo salvo nos favoritos ou um link de
 * WhatsApp que veio quebrado.
 */
export default function NaoEncontrada() {
  return (
    <TelaDeAviso
      codigo="404"
      titulo="Esta página não existe"
      descricao="O endereço pode ter mudado de lugar, ou o link que trouxe você até aqui veio incompleto. Nada foi perdido."
      acao={
        <>
          <Link href="/dashboard" className="btn-primary">
            Ir para o painel
          </Link>
          <Link href="/pos" className="btn-secondary">
            Abrir o PDV
          </Link>
        </>
      }
    />
  );
}
