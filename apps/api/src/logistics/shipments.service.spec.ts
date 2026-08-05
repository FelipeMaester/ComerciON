import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationsService } from '../whatsapp/automations.service';

describe('ShipmentsService', () => {
  let service: ShipmentsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let automationsService: { sendShippingUpdate: jest.Mock };

  beforeEach(() => {
    prisma = {
      sale: { findUnique: jest.fn() },
      shipment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      shipmentEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    automationsService = { sendShippingUpdate: jest.fn().mockResolvedValue(undefined) };
    service = new ShipmentsService(prisma as unknown as PrismaService, automationsService as unknown as AutomationsService);
  });

  describe('create', () => {
    it('rejeita criar envio para venda que não existe', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);
      await expect(service.create('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita criar envio para venda não confirmada', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 's1', status: 'QUOTE', shipment: null });
      await expect(service.create('s1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita criar um segundo envio para a mesma venda', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED', shipment: { id: 'existing' } });
      await expect(service.create('s1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cria o envio e registra o evento inicial PROCESSING', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED', shipment: null });
      prisma.shipment.create.mockResolvedValue({ id: 'ship-1', status: 'PROCESSING' });

      await service.create('s1', 'Correios', 'BR123456789');

      expect(prisma.shipment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ carrier: 'Correios', trackingCode: 'BR123456789' }) }),
      );
      expect(prisma.shipmentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shipmentId: 'ship-1', status: 'PROCESSING' }) }),
      );
    });
  });

  describe('updateStatus', () => {
    it('lança NotFoundException se não existe envio para a venda', async () => {
      prisma.shipment.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('s1', 'SHIPPED')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('permite avançar a sequência normal (PROCESSING -> SHIPPED)', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'PROCESSING', shippedAt: null });
      prisma.shipment.update.mockResolvedValue({ id: 'ship-1', status: 'SHIPPED' });

      await service.updateStatus('s1', 'SHIPPED', 'Postado nos Correios');

      expect(prisma.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SHIPPED' }) }),
      );
    });

    it('rejeita retroceder o status (SHIPPED -> PROCESSING)', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'SHIPPED', shippedAt: new Date() });
      await expect(service.updateStatus('s1', 'PROCESSING')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shipment.update).not.toHaveBeenCalled();
    });

    it('rejeita repetir o mesmo status', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'SHIPPED', shippedAt: new Date() });
      await expect(service.updateStatus('s1', 'SHIPPED')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita qualquer mudança depois de RETURNED (estado terminal)', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'RETURNED', shippedAt: new Date() });
      await expect(service.updateStatus('s1', 'PROCESSING')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite RETURNED mesmo depois de DELIVERED', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'DELIVERED', shippedAt: new Date() });
      prisma.shipment.update.mockResolvedValue({ id: 'ship-1', status: 'RETURNED' });

      await service.updateStatus('s1', 'RETURNED', 'Cliente recusou');

      expect(prisma.shipment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RETURNED' }) }),
      );
    });

    it('rejeita DELIVERED -> qualquer coisa que não seja RETURNED', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'DELIVERED', shippedAt: new Date() });
      await expect(service.updateStatus('s1', 'IN_TRANSIT')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('dispara o aviso de rastreio por WhatsApp ao mudar para SHIPPED', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'PROCESSING', shippedAt: null });
      prisma.shipment.update.mockResolvedValue({ id: 'ship-1', status: 'SHIPPED' });

      await service.updateStatus('s1', 'SHIPPED');

      expect(automationsService.sendShippingUpdate).toHaveBeenCalledWith('s1', 'SHIPPED');
    });

    it('não deixa uma falha no envio do WhatsApp derrubar a atualização de status', async () => {
      prisma.shipment.findUnique.mockResolvedValue({ id: 'ship-1', status: 'PROCESSING', shippedAt: null });
      prisma.shipment.update.mockResolvedValue({ id: 'ship-1', status: 'SHIPPED' });
      automationsService.sendShippingUpdate.mockRejectedValue(new Error('provedor fora do ar'));

      const result = await service.updateStatus('s1', 'SHIPPED');

      expect(result).toEqual({ id: 'ship-1', status: 'SHIPPED' });
    });
  });
});
