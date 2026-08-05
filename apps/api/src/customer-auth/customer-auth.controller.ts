import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt-auth.guard';
import { AuthenticatedCustomer } from './types/customer-jwt-payload.type';
import { CustomerAuthService } from './customer-auth.service';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { RefreshCustomerTokenDto } from './dto/refresh-customer-token.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';

@ApiTags('customer-auth')
@Controller('customer-auth')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterCustomerDto) {
    return this.customerAuthService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginCustomerDto) {
    return this.customerAuthService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshCustomerTokenDto) {
    return this.customerAuthService.refresh(dto);
  }

  @Public()
  @ApiBearerAuth()
  @UseGuards(CustomerJwtAuthGuard)
  @Get('me')
  me(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerAuthService.me(customer.sub);
  }
}
