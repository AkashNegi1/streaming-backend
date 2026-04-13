import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(){
     const pool = new Pool({
      connectionString: process.env.SUPABASE_URL,
     })
     const adapter = new PrismaPg(pool)
     super({adapter});
  }
  
}