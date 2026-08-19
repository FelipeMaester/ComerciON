import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SituacaoDaConexao = 'desconectado' | 'aguardando_leitura' | 'conectando' | 'conectado';

export interface EstadoDaConexao {
  situacao: SituacaoDaConexao;
  /** QR em texto, para a tela desenhar. Só existe enquanto espera leitura. */
  qr?: string;
  numero?: string | null;
  conectadoEm?: Date | null;
}

/** Uma sessão viva na memória deste processo. */
interface SessaoViva {
  socket: WASocket;
  situacao: SituacaoDaConexao;
  qr?: string;
}

/**
 * Conecta o WhatsApp da própria loja, por QR Code.
 *
 * O caminho oficial (Twilio, Meta) cobra por conversa e exige verificação de
 * empresa — foi onde a cobrança emperrou: conta de teste só entrega para
 * número previamente verificado. Aqui a loja usa o número que já usa todo dia,
 * lendo um QR como faria no WhatsApp Web.
 *
 * O QUE ISSO CUSTA, e está dito na tela de conexão: é uma API NÃO OFICIAL. Os
 * termos do WhatsApp não a preveem, e o número pode ser bloqueado. Para uma
 * loja cujo WhatsApp é o canal de vendas, isso não é detalhe — por isso o
 * provedor oficial continua disponível ao lado, e a escolha é da loja.
 *
 * Escopo desta primeira versão: conectar e ENVIAR. Não recebe mensagem nem
 * responde nada — o Inbox e o chatbot continuam atendidos pelo provedor
 * oficial. Menos superfície, menos coisa para dar errado no canal que a loja
 * usa para vender.
 */
@Injectable()
export class SessaoWhatsappService implements OnModuleDestroy {
  private readonly logger = new Logger('SessaoWhatsappService');

  /**
   * As sessões vivas, por loja.
   *
   * Em memória de propósito: um socket aberto não se serializa. O que
   * sobrevive a reinício são as CREDENCIAIS, no banco — com elas a sessão
   * volta sozinha, sem novo QR.
   */
  private readonly sessoes = new Map<string, SessaoViva>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy() {
    // Fecha os sockets no encerramento: sem isso o processo não morre e o
    // deploy fica pendurado esperando um handle que nunca fecha.
    for (const [tenantId, sessao] of this.sessoes) {
      try {
        sessao.socket.end(undefined);
      } catch {
        this.logger.warn(`Falha ao encerrar a sessão de WhatsApp do tenant ${tenantId}`);
      }
    }
    this.sessoes.clear();
  }

  /** O que a tela mostra: conectado, esperando leitura do QR, ou nada. */
  async estado(tenantId: string): Promise<EstadoDaConexao> {
    const viva = this.sessoes.get(tenantId);
    if (viva) {
      const registro = await this.prisma.whatsappSession.findUnique({ where: { tenantId } });
      return {
        situacao: viva.situacao,
        qr: viva.situacao === 'aguardando_leitura' ? viva.qr : undefined,
        numero: registro?.numero,
        conectadoEm: registro?.conectadoEm,
      };
    }

    const registro = await this.prisma.whatsappSession.findUnique({ where: { tenantId } });
    if (!registro) return { situacao: 'desconectado' };

    // Credencial guardada mas sem socket: a API reiniciou. Levanta de novo.
    return { situacao: 'desconectado', numero: registro.numero, conectadoEm: registro.conectadoEm };
  }

  /**
   * Abre (ou reabre) a sessão. Devolve assim que houver QR ou conexão.
   *
   * Não espera a leitura do QR: a tela pergunta o estado de tempos em tempos.
   * Segurar a requisição HTTP até alguém pegar o celular seria um timeout
   * garantido.
   */
  async conectar(tenantId: string): Promise<EstadoDaConexao> {
    const jaViva = this.sessoes.get(tenantId);
    if (jaViva && jaViva.situacao === 'conectado') return this.estado(tenantId);
    if (jaViva) {
      try {
        jaViva.socket.end(undefined);
      } catch {
        // Socket já morto: seguir e abrir outro.
      }
      this.sessoes.delete(tenantId);
    }

    await this.abrirSocket(tenantId);

    // Espera curta para o QR aparecer — o Baileys emite em menos de um
    // segundo. Sem isso a primeira resposta viria sem QR e a tela piscaria.
    for (let i = 0; i < 20; i++) {
      const atual = this.sessoes.get(tenantId);
      if (atual?.qr || atual?.situacao === 'conectado') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return this.estado(tenantId);
  }

  /**
   * Desconecta e ESQUECE as credenciais.
   *
   * Apagar é o certo: "desconectar" que guarda a chave de acesso à conta não
   * desconecta nada de verdade. Quem quiser voltar lê o QR de novo.
   */
  async desconectar(tenantId: string): Promise<void> {
    const viva = this.sessoes.get(tenantId);
    if (viva) {
      try {
        await viva.socket.logout();
      } catch {
        try {
          viva.socket.end(undefined);
        } catch {
          // Já estava caído.
        }
      }
      this.sessoes.delete(tenantId);
    }
    await this.prisma.whatsappSession.deleteMany({ where: { tenantId } });
  }

  /** Envia pelo número da loja. Falha explícita quando não há sessão. */
  async enviar(tenantId: string, telefone: string, texto: string): Promise<{ externalId: string }> {
    let sessao = this.sessoes.get(tenantId);

    // Sessão caída mas credencial guardada (a API reiniciou): levanta agora,
    // em vez de exigir que alguém volte na tela e leia o QR.
    if (!sessao || sessao.situacao !== 'conectado') {
      const registro = await this.prisma.whatsappSession.findUnique({ where: { tenantId } });
      if (registro) {
        await this.abrirSocket(tenantId);
        for (let i = 0; i < 40 && this.sessoes.get(tenantId)?.situacao !== 'conectado'; i++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        sessao = this.sessoes.get(tenantId);
      }
    }

    if (!sessao || sessao.situacao !== 'conectado') {
      throw new Error('O WhatsApp desta loja não está conectado. Leia o QR Code em Configurações → WhatsApp.');
    }

    const destino = `${this.somenteDigitos(telefone)}@s.whatsapp.net`;
    const resultado = await sessao.socket.sendMessage(destino, { text: texto });
    return { externalId: resultado?.key?.id ?? 'sem-id' };
  }

  /**
   * Levanta o socket e liga os dois eventos que importam: credencial nova
   * (grava) e mudança de conexão (QR, conectado, caiu).
   */
  private async abrirSocket(tenantId: string): Promise<void> {
    const { state, salvar } = await this.autenticacaoNoBanco(tenantId);

    const socket = makeWASocket({
      auth: state,
      // Sem isto o Baileys imprime o QR no console do servidor — inútil aqui,
      // porque quem lê o QR está na frente do navegador, não do terminal.
      printQRInTerminal: false,
      // Identifica o cliente na lista de aparelhos conectados do celular. É o
      // que o lojista vê ao conferir "aparelhos conectados" no WhatsApp dele.
      browser: ['ComerciON', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    this.sessoes.set(tenantId, { socket, situacao: 'conectando' });

    socket.ev.on('creds.update', () => {
      salvar().catch((erro) =>
        this.logger.error(`Falha ao gravar as credenciais de WhatsApp do tenant ${tenantId}`, erro as Error),
      );
    });

    socket.ev.on('connection.update', (evento) => {
      const sessao = this.sessoes.get(tenantId);
      if (!sessao) return;

      if (evento.qr) {
        sessao.qr = evento.qr;
        sessao.situacao = 'aguardando_leitura';
      }

      if (evento.connection === 'open') {
        sessao.situacao = 'conectado';
        sessao.qr = undefined;
        const numero = socket.user?.id?.split(':')[0] ?? null;
        this.prisma.whatsappSession
          .updateMany({ where: { tenantId }, data: { numero, conectadoEm: new Date() } })
          .catch(() => undefined);
        this.logger.log(`WhatsApp conectado para o tenant ${tenantId}`);
      }

      if (evento.connection === 'close') {
        const motivo = (evento.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;

        // Deslogado pelo celular: a credencial guardada não vale mais. Apagar
        // evita um ciclo de reconexão que nunca dá certo e enche o log.
        if (motivo === DisconnectReason.loggedOut) {
          this.sessoes.delete(tenantId);
          this.prisma.whatsappSession.deleteMany({ where: { tenantId } }).catch(() => undefined);
          this.logger.warn(`Sessão de WhatsApp do tenant ${tenantId} foi encerrada no celular`);
          return;
        }

        // Qualquer outra queda é passageira (rede, restart pedido pelo
        // servidor do WhatsApp): reabre.
        this.sessoes.delete(tenantId);
        this.abrirSocket(tenantId).catch((erro) =>
          this.logger.error(`Falha ao reconectar o WhatsApp do tenant ${tenantId}`, erro as Error),
        );
      }
    });
  }

  /**
   * O estado de autenticação do Baileys, guardado no banco.
   *
   * O Baileys traz um `useMultiFileAuthState` que grava dezenas de arquivos
   * numa pasta. Não serve aqui: são várias lojas no mesmo servidor, o
   * container pode não ter disco persistente, e credencial de conta espalhada
   * em arquivo solto é pior de proteger do que uma coluna.
   *
   * `BufferJSON` é obrigatório na serialização: as chaves são Buffers, e um
   * JSON.stringify comum os transforma em `{"type":"Buffer","data":[...]}`,
   * que volta como objeto e quebra a criptografia na primeira mensagem.
   */
  private async autenticacaoNoBanco(tenantId: string): Promise<{ state: AuthenticationState; salvar: () => Promise<void> }> {
    const registro = await this.prisma.whatsappSession.findUnique({ where: { tenantId } });

    const guardado = registro
      ? (JSON.parse(JSON.stringify(registro.credenciais), BufferJSON.reviver) as {
          creds: AuthenticationCreds;
          keys: Record<string, Record<string, unknown>>;
        })
      : { creds: initAuthCreds(), keys: {} };

    const creds = guardado.creds;
    const keys = guardado.keys ?? {};

    const salvar = async () => {
      const serializado = JSON.parse(JSON.stringify({ creds, keys }, BufferJSON.replacer));
      await this.prisma.whatsappSession.upsert({
        where: { tenantId },
        create: { tenantId, credenciais: serializado } as Prisma.WhatsappSessionUncheckedCreateInput,
        update: { credenciais: serializado },
      });
    };

    const state: AuthenticationState = {
      creds,
      keys: {
        get: (tipo, ids) => {
          const doTipo = keys[tipo] ?? {};
          const resultado: { [id: string]: SignalDataTypeMap[typeof tipo] } = {};
          for (const id of ids) {
            let valor = doTipo[id];
            if (tipo === 'app-state-sync-key' && valor) {
              valor = proto.Message.AppStateSyncKeyData.fromObject(valor as object);
            }
            if (valor !== undefined) resultado[id] = valor as SignalDataTypeMap[typeof tipo];
          }
          return Promise.resolve(resultado);
        },
        set: (dados) => {
          for (const tipo of Object.keys(dados)) {
            keys[tipo] = keys[tipo] ?? {};
            for (const [id, valor] of Object.entries(dados[tipo as keyof typeof dados] ?? {})) {
              if (valor === null || valor === undefined) delete keys[tipo][id];
              else keys[tipo][id] = valor as unknown as Record<string, unknown>;
            }
          }
          return salvar();
        },
      },
    };

    return { state, salvar };
  }

  /** O WhatsApp quer só dígitos, com DDI. */
  private somenteDigitos(telefone: string): string {
    const limpo = telefone.replace(/\D/g, '');
    // Número brasileiro digitado sem o 55 é o caso comum no cadastro de
    // clientes — sem esta correção a mensagem sai para um destino inexistente.
    return limpo.length <= 11 ? `55${limpo}` : limpo;
  }
}
