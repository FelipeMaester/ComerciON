import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentCustomer } from '../common/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt-auth.guard';
import { AuthenticatedCustomer } from '../customer-auth/types/customer-jwt-payload.type';
import { CreateCustomerAddressDto } from '../customers/dto/create-customer-address.dto';
import { EstimateFreightDto } from '../logistics/dto/estimate-freight.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { UpdateCustomerProfileDto } from './dto/update-profile.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { StorefrontService } from './storefront.service';

// @Public() no controller inteiro: nenhuma rota aqui exige token de STAFF.
// As rotas que precisam de cliente autenticado aplicam CustomerJwtAuthGuard
// localmente (ver cada método) — os dois mundos de autenticação não se misturam.
@ApiTags('storefront')
@Public()
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('branding')
  getBranding() {
    return this.storefrontService.getBranding();
  }

  @Get('quotes/:token')
  getQuote(@Param('token') token: string) {
    return this.storefrontService.getQuoteByToken(token);
  }

  @Post('quotes/:token/approve')
  approveQuote(@Param('token') token: string) {
    return this.storefrontService.approveQuote(token);
  }

  @Post('quotes/:token/reject')
  rejectQuote(@Param('token') token: string) {
    return this.storefrontService.rejectQuote(token);
  }

  @Get('products')
  listProducts(@Query('search') search?: string, @Query('categoryId') categoryId?: string) {
    return this.storefrontService.listProducts(search, categoryId);
  }

  @Get('categories')
  listCategories() {
    return this.storefrontService.listCategories();
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.storefrontService.getProduct(id);
  }

  @Get('products/:id/reviews')
  listReviews(@Param('id') id: string) {
    return this.storefrontService.listReviews(id);
  }

  @Post('coupons/validate')
  validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.storefrontService.previewCoupon(dto.code, dto.subtotal);
  }

  @Post('freight/estimate')
  estimateFreight(@Body() dto: EstimateFreightDto) {
    return this.storefrontService.previewFreight(dto.items, dto.destinationState);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Post('products/:id/reviews')
  createReview(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.storefrontService.createOrUpdateReview(customer.sub, id, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Post('checkout')
  checkout(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CheckoutDto) {
    return this.storefrontService.checkout(customer.sub, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Get('orders')
  listMyOrders(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.storefrontService.listMyOrders(customer.sub);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Get('orders/:id')
  getMyOrder(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id') id: string) {
    return this.storefrontService.getMyOrder(customer.sub, id);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Get('addresses')
  listMyAddresses(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.storefrontService.listMyAddresses(customer.sub);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Post('addresses')
  addAddress(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateCustomerAddressDto) {
    return this.storefrontService.addAddress(customer.sub, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Patch('profile')
  updateProfile(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: UpdateCustomerProfileDto) {
    return this.storefrontService.updateProfile(customer.sub, dto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @Post('cart/sync')
  syncCart(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: SyncCartDto) {
    return this.storefrontService.syncCart(customer.sub, dto.items);
  }
}
