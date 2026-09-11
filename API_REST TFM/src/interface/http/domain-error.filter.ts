import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainError } from '../../domain/errors/domain-error';

/**
 * Toda violación de una regla de negocio (DomainError) se traduce aquí a un
 * 400 con el mensaje tal cual — el cliente (UI web, app móvil, o el propio
 * Motor IA vía MCP) recibe el motivo exacto, no un 500 genérico.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
    });
  }
}
