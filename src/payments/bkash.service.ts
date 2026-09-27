import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BkashService {
  private readonly logger = new Logger(BkashService.name);

  constructor(private readonly configService: ConfigService) {}

  private get baseUrl(): string {
    return this.configService.get<string>(
      'bkash.baseUrl',
      'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
    );
  }

  private get username(): string {
    return this.configService.get<string>('bkash.username', '');
  }

  private get password(): string {
    return this.configService.get<string>('bkash.password', '');
  }

  private get appKey(): string {
    return this.configService.get<string>('bkash.appKey', '');
  }

  private get appSecret(): string {
    return this.configService.get<string>('bkash.appSecret', '');
  }

  /**
   * Grant Token from bKash API
   * POST {baseUrl}/tokenized/checkout/token/grant
   */
  async grantToken(): Promise<string> {
    const url = `${this.baseUrl}/tokenized/checkout/token/grant`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          username: this.username,
          password: this.password,
        },
        body: JSON.stringify({
          app_key: this.appKey,
          app_secret: this.appSecret,
        }),
      });

      const data: any = await response.json();

      if (!response.ok || !data.id_token) {
        this.logger.error(
          `bKash Grant Token failed. Status: ${response.status}, Code: ${data?.statusCode}, Msg: ${data?.statusMessage}`,
        );
        throw new BadGatewayException(
          data?.statusMessage ||
            'Failed to authenticate with bKash payment gateway.',
        );
      }

      return data.id_token;
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        `Error connecting to bKash Grant Token: ${error.message}`,
      );
      throw new BadGatewayException('Unable to reach bKash payment gateway.');
    }
  }

  /**
   * Create bKash Payment Checkout
   * POST {baseUrl}/tokenized/checkout/create
   */
  async createPayment(params: {
    amount: number;
    invoiceNumber: string;
    callbackUrl: string;
  }): Promise<{
    paymentID: string;
    bkashURL: string;
    callbackURL: string;
    amount: string;
    currency: string;
    intent: string;
    transactionStatus: string;
  }> {
    const idToken = await this.grantToken();
    const url = `${this.baseUrl}/tokenized/checkout/create`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: idToken,
          'x-app-key': this.appKey,
        },
        body: JSON.stringify({
          mode: '0011',
          payerReference: 'EchoGPT-User',
          callbackURL: params.callbackUrl,
          amount: params.amount.toFixed(2),
          currency: 'BDT',
          intent: 'sale',
          merchantInvoiceNumber: params.invoiceNumber,
        }),
      });

      const data: any = await response.json();

      if (!response.ok || data.statusCode !== '0000' || !data.paymentID) {
        this.logger.error(
          `bKash Create Payment failed. Status: ${response.status}, Code: ${data?.statusCode}, Msg: ${data?.statusMessage}`,
        );
        throw new BadRequestException(
          data?.statusMessage || 'Failed to initialize bKash payment checkout.',
        );
      }

      this.logger.log(
        `Created bKash payment checkout [PaymentID: ${data.paymentID}]`,
      );

      return {
        paymentID: data.paymentID,
        bkashURL: data.bkashURL,
        callbackURL: data.callbackURL,
        amount: data.amount,
        currency: data.currency,
        intent: data.intent,
        transactionStatus: data.transactionStatus,
      };
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      )
        throw error;
      this.logger.error(`Error creating bKash payment: ${error.message}`);
      throw new BadGatewayException(
        'Could not initiate bKash payment process.',
      );
    }
  }

  /**
   * Execute bKash Payment
   * POST {baseUrl}/tokenized/checkout/execute
   */
  async executePayment(paymentID: string): Promise<{
    paymentID: string;
    trxID: string;
    transactionStatus: string;
    amount: string;
    currency: string;
    statusCode: string;
    statusMessage: string;
  }> {
    const idToken = await this.grantToken();
    const url = `${this.baseUrl}/tokenized/checkout/execute`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: idToken,
          'x-app-key': this.appKey,
        },
        body: JSON.stringify({
          paymentID,
        }),
      });

      const data: any = await response.json();

      if (
        !response.ok ||
        (data.statusCode !== '0000' && data.statusCode !== '2058')
      ) {
        this.logger.error(
          `bKash Execute Payment failed. PaymentID: ${paymentID}, Code: ${data?.statusCode}, Msg: ${data?.statusMessage}`,
        );
        throw new BadRequestException(
          data?.statusMessage ||
            'bKash payment execution failed or was declined.',
        );
      }

      let trxID = data.trxID;
      let transactionStatus = data.transactionStatus;

      if (
        !trxID &&
        (data.statusCode === '0000' || data.statusCode === '2058')
      ) {
        try {
          const queryRes = await this.queryPayment(paymentID);
          if (queryRes?.trxID) {
            trxID = queryRes.trxID;
          }
          if (queryRes?.transactionStatus) {
            transactionStatus = queryRes.transactionStatus;
          }
        } catch (e: any) {
          this.logger.warn(
            `Could not fetch queryPayment fallback for PaymentID [${paymentID}]: ${e.message}`,
          );
        }
      }

      this.logger.log(
        `bKash payment executed successfully. PaymentID: ${paymentID}, TrxID: ${trxID}, Status: ${transactionStatus}, Code: ${data.statusCode}`,
      );

      return {
        paymentID: data.paymentID || paymentID,
        trxID: trxID || '',
        transactionStatus: transactionStatus || 'Completed',
        amount: data.amount,
        currency: data.currency,
        statusCode: data.statusCode,
        statusMessage: data.statusMessage,
      };
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      )
        throw error;
      this.logger.error(
        `Error executing bKash payment [${paymentID}]: ${error.message}`,
      );
      throw new BadGatewayException(
        'Failed to verify payment with bKash gateway.',
      );
    }
  }

  /**
   * Query bKash Payment Status
   * POST {baseUrl}/tokenized/checkout/payment/status
   */
  async queryPayment(paymentID: string): Promise<any> {
    const idToken = await this.grantToken();
    const url = `${this.baseUrl}/tokenized/checkout/payment/status`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: idToken,
          'x-app-key': this.appKey,
        },
        body: JSON.stringify({
          paymentID,
        }),
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error(
        `Error querying bKash payment status: ${error.message}`,
      );
      throw new BadGatewayException('Could not query bKash payment status.');
    }
  }
}
