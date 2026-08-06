import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_SELECT = {
  name: true,
  tagline: true,
  description: true,
  logoUrl: true,
  bannerUrl: true,
  logoPosition: true,
  bannerPosition: true,
  primaryColor: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: SETTINGS_SELECT });
  }

  async updateSettings(tenantId: string, dto: UpdateSettingsDto) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: dto, select: SETTINGS_SELECT });
  }
}
