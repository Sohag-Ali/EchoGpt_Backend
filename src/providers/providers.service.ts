import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveProviders() {
    return this.prisma.aIProvider.findMany({
      where: { isActive: true },
    });
  }
}
