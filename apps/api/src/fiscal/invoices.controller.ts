import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleKey, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequiresModule } from '../common/decorators/requires-module.decorator';
import { AddCorrectionDto } from './dto/add-correction.dto';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { IssueInvoiceDto } from './dto/issue-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('fiscal')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.FINANCE)
@RequiresModule(ModuleKey.FISCAL)
@Controller('fiscal/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('sales/:saleId')
  findBySale(@Param('saleId') saleId: string) {
    return this.invoicesService.findBySale(saleId);
  }

  @Post('sales/:saleId/issue')
  issue(@Param('saleId') saleId: string, @Body() dto: IssueInvoiceDto) {
    return this.invoicesService.issue(saleId, dto.type);
  }

  @Post('sales/:saleId/cancel')
  cancel(@Param('saleId') saleId: string, @Body() dto: CancelInvoiceDto) {
    return this.invoicesService.cancel(saleId, dto.reason);
  }

  @Post('sales/:saleId/corrections')
  addCorrection(@Param('saleId') saleId: string, @Body() dto: AddCorrectionDto) {
    return this.invoicesService.addCorrection(saleId, dto.text);
  }
}
