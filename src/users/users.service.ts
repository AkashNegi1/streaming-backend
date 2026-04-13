import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async createUser(data: { email: string; password: string }) {
    
    return this.prisma.user.create({
      data,
    });
  }
}