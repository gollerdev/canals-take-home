import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  AddressNotGeocodableError,
  GeocodingUnavailableError,
} from '../../geocoding/geocoding.errors';
import {
  PaymentRequestRejectedError,
  PaymentUnavailableError,
} from '../../payments/payments.errors';
import { CustomerNotFoundError } from '../../orders/exceptions/customer-not-found.exception';
import { DuplicateProductError } from '../../orders/exceptions/duplicate-product.exception';
import { EmptyOrderError } from '../../orders/exceptions/empty-order.exception';
import { InvalidCustomerIdError } from '../../orders/exceptions/invalid-customer-id.exception';
import { InvalidIdempotencyKeyError } from '../../orders/exceptions/invalid-idempotency-key.exception';
import { InvalidProductIdError } from '../../orders/exceptions/invalid-product-id.exception';
import { InvalidQuantityError } from '../../orders/exceptions/invalid-quantity.exception';
import { OrderInProgressError } from '../../orders/exceptions/order-in-progress.exception';
import { OrderNotFoundError } from '../../orders/exceptions/order-not-found.exception';
import { OrderNotPendingError } from '../../orders/exceptions/order-not-pending.exception';
import { UnknownProductsError } from '../../products/exceptions/unknown-products.exception';

const STATUS_BY_ERROR = new Map<new (...args: never[]) => Error, HttpStatus>([
  [EmptyOrderError, HttpStatus.BAD_REQUEST],
  [DuplicateProductError, HttpStatus.BAD_REQUEST],
  [InvalidProductIdError, HttpStatus.BAD_REQUEST],
  [InvalidQuantityError, HttpStatus.BAD_REQUEST],
  [InvalidCustomerIdError, HttpStatus.BAD_REQUEST],
  [InvalidIdempotencyKeyError, HttpStatus.BAD_REQUEST],
  [UnknownProductsError, HttpStatus.BAD_REQUEST],
  [AddressNotGeocodableError, HttpStatus.BAD_REQUEST],
  [PaymentRequestRejectedError, HttpStatus.BAD_REQUEST],
  [CustomerNotFoundError, HttpStatus.NOT_FOUND],
  [OrderNotFoundError, HttpStatus.NOT_FOUND],
  [OrderInProgressError, HttpStatus.CONFLICT],
  [OrderNotPendingError, HttpStatus.CONFLICT],
  [GeocodingUnavailableError, HttpStatus.SERVICE_UNAVAILABLE],
  [PaymentUnavailableError, HttpStatus.SERVICE_UNAVAILABLE],
]);

const RETRY_AFTER_SECONDS = 2;

function statusOf(error: Error): HttpStatus | undefined {
  for (const [type, status] of STATUS_BY_ERROR) {
    if (error instanceof type) {
      return status;
    }
  }

  return undefined;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const error = exception instanceof Error ? exception : undefined;
    const status = error ? statusOf(error) : undefined;

    if (!error || status === undefined) {
      this.logger.error('Unhandled error', error?.stack ?? String(exception));

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'InternalServerError',
        message: 'An unexpected error occurred',
      });
      return;
    }

    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      this.logger.warn(`${error.name}: ${error.message}`);
    }

    if (error instanceof OrderInProgressError) {
      response.setHeader('Retry-After', RETRY_AFTER_SECONDS);
    }

    response.status(status).json({
      statusCode: status,
      error: error.name,
      message: error.message,
    });
  }
}
